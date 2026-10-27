const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const { createServer } = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium, expect } = require('@playwright/test');
const { createTextElement } = require('@sunaissu/noteboard');
const root = path.resolve(__dirname, '..');
const backendRoot = path.resolve(root, '../backend');
const backend = createRequire(path.join(backendRoot, 'package.json'));
const { MongoMemoryReplSet } = backend('mongodb-memory-server');
const mongoose = backend('mongoose');
const { WebSocket } = backend('ws');
const output = process.env.QA_OUTPUT || path.join(root, 'test/artifacts/documentation-collaboration');
Object.assign(process.env, {
  NODE_ENV: 'test', ENVIRONMENT: 'test', CLIENT_URL: 'http://localhost:3000',
  COLLABORATION_SECRET: 'documentation-browser-collaboration-secret-32-characters',
  SESSION_SECRET: 'documentation-browser-session-secret-32-characters',
  GOOGLE_AUTH_CLIENT_ID: 'test', GOOGLE_AUTH_CLIENT_SECRET: 'test',
  GOOGLE_CALLBACK_URL: 'http://localhost:5000/auth/google/callback',
  MONGO_CONN: 'mongodb://127.0.0.1:1', MONGO_AUTH_MODE: 'password', MONGO_DB_NAME: 'disposable_documentation_browser',
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const load = file => import(pathToFileURL(path.join(backendRoot, 'dist', file)).href);
  const [{ default: Note }, { default: User }, { default: DeviceSession }, collaboration, { createCollaborationToken }] = await Promise.all([
    load('models/note.model.js'), load('models/user.model.js'), load('models/deviceSession.model.js'),
    load('collaboration/server.js'), load('util/collaborationToken.js'),
  ]);
  const replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.16' }, replSet: { count: 1, spawn: { windowsHide: true } } });
  const server = createServer(), sockets = new Set(), errors = [];
  let browser;
  try {
    await mongoose.connect(replica.getUri(), { dbName: 'disposable_documentation_browser' });
    const owner = await User.create({ username: 'Documentation owner', email: 'documentation-owner@example.test' });
    const peer = await User.create({ username: 'Documentation peer', email: 'documentation-peer@example.test' });
    const content = { format: 'thyncspace-documentation', version: 1, sections: [
      { id: 'plan', type: 'text', title: 'Plan', content: 'Initial plan' },
      { id: 'review', type: 'text', title: 'Review', content: 'Initial review' },
      { id: 'diagram', type: 'board', title: 'Shared diagram', caption: 'Shared board section', height: 440, elements: [createTextElement({ id: 'label', x: 35, y: 25, text: 'Shared starting point', fontSize: 20 })], viewport: { panX: 0, panY: 0, zoom: 1 } },
    ] };
    const note = await Note.create({ owner: owner._id, title: 'Collaborative documentation', type: 'documentation', content: JSON.stringify(content), sharedWith: [{ userId: peer._id, permission: 'editor' }] });
    collaboration.attachCollaborationServer(server);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
    const contextFor = async user => {
      const sessionHash = randomBytes(32).toString('hex');
      await DeviceSession.create({ userId: user.id, sessionHash, expiresAt: new Date(Date.now() + 3600000) });
      const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
      await context.route('**/api/**', async route => {
        const request = route.request(), endpoint = new URL(request.url()).pathname;
        let body;
        if (endpoint.endsWith('/getUser')) body = { user: { _id: user.id, username: user.username } };
        else if (endpoint.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
        else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture' };
        else if (endpoint.endsWith('/collaboration-token')) body = { token: createCollaborationToken(note.id, user.id, sessionHash) };
        else if (endpoint.endsWith('/private')) { errors.push('Shared documentation attempted a private REST save.'); await route.fulfill({ status: 400, json: { error: 'Shared notes require collaboration' } }); return; }
        else if (endpoint.endsWith('/shared') || endpoint.endsWith('/history') || endpoint.endsWith('/reminders')) body = [];
        else { const current = (await Note.findById(note.id)).toObject(); body = endpoint.endsWith('/notes') ? [current] : current; }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await context.routeWebSocket('**/collaboration', route => {
        const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/collaboration`, { origin: 'http://localhost:3000' });
        const pending = []; sockets.add(socket);
        socket.on('open', () => { for (const message of pending) socket.send(message); pending.length = 0; });
        route.onMessage(message => socket.readyState === WebSocket.OPEN ? socket.send(message) : pending.push(message));
        socket.on('message', message => route.send(message));
        socket.on('close', () => { sockets.delete(socket); route.close(); });
        socket.on('error', () => route.close());
        route.onClose(() => { sockets.delete(socket); socket.close(); });
      });
      return context;
    };
    const ownerContext = await contextFor(owner), peerContext = await contextFor(peer);
    const open = async context => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto((process.env.REVIEW_URL || 'http://127.0.0.1:3010') + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('Plan', { timeout: 30000 });
      return page;
    };
    const a = await open(ownerContext), b = await open(peerContext);
    const section = (page, id) => page.locator(`#documentation-section-${id}`);
    const source = (page, id) => section(page, id).getByRole('textbox', { name: 'Markdown source' });
    const markdown = async page => { for (const id of ['plan', 'review']) { if (!await source(page, id).count()) await section(page, id).getByRole('button', { name: 'Markdown', exact: true }).click(); } };
    await markdown(a); await markdown(b);
    await Promise.all([source(a, 'plan').fill('Owner planning update'), source(b, 'review').fill('Peer review update')]);
    for (const page of [a, b]) {
      await expect(source(page, 'plan')).toHaveValue('Owner planning update');
      await expect(source(page, 'review')).toHaveValue('Peer review update');
    }
    await section(b, 'diagram').getByRole('button', { name: 'Edit diagram', exact: true }).click();
    await section(b, 'diagram').getByRole('button', { name: 'Rectangle', exact: true }).click();
    const canvas = section(b, 'diagram').getByLabel('Noteboard canvas', { exact: true });
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await b.mouse.move(box.x + 320, box.y + 150); await b.mouse.down(); await b.mouse.move(box.x + 480, box.y + 260, { steps: 10 }); await b.mouse.up();
    for (const page of [a, b]) await expect(section(page, 'diagram').getByText('2 objects', { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const saved = JSON.parse((await Note.findById(note.id)).content);
      return saved.sections.map(item => item.type === 'text' ? item.content : item.elements.length);
    }, { timeout: 15000 }).toEqual(['Owner planning update', 'Peer review update', 2]);
    for (const page of [a, b]) await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15000 });
    await a.screenshot({ path: path.join(output, 'owner-shared-board.png') });
    await b.screenshot({ path: path.join(output, 'peer-editing-board.png') });
    await Promise.all([a.reload(), b.reload()]);
    await markdown(a); await markdown(b);
    for (const page of [a, b]) {
      await expect(source(page, 'plan')).toHaveValue('Owner planning update');
      await expect(source(page, 'review')).toHaveValue('Peer review update');
      await expect(section(page, 'diagram').getByText('2 objects', { exact: true })).toBeVisible();
    }
    await Note.updateOne({ _id: note.id, 'sharedWith.userId': peer.id }, { $set: { 'sharedWith.$.permission': 'viewer' } });
    collaboration.updateCollaboratorPermission(note.id, peer.id, 'viewer');
    await expect(b.getByRole('textbox', { name: 'Markdown source' })).toHaveCount(0);
    await expect(b.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveCount(0);
    await expect(b.getByRole('button', { name: 'Edit diagram', exact: true })).toHaveCount(0);
    await expect(b.locator('.documentation-text-preview')).toContainText(['Owner planning update', 'Peer review update']);
    const connections = collaboration.collaborationServer.documents.get(note.id).getConnections().filter(connection => connection.context.userId === peer.id);
    assert.ok(connections.length && connections.every(connection => connection.readOnly));
    await b.screenshot({ path: path.join(output, 'peer-viewer.png') });
    assert.deepEqual(errors, []);
    const report = { passed: true, accounts: 2, transport: 'real MongoDB and WebSocket; authenticated fixture HTTP reads', checks: ['concurrent edits in different text sections', 'peer board edit reaches both clients', 'durable saved receipts', 'reload retains both text sections and board', 'live viewer downgrade removes edit controls and enforces read-only connection'] };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (browser) await browser.close();
    for (const socket of sockets) socket.terminate();
    await collaboration.shutdownCollaborationServer();
    await collaboration.collaborationServer.hooks('onDestroy', {});
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await replica.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

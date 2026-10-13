const { chromium, expect } = require('@playwright/test');
const { createRequire } = require('node:module');
const path = require('node:path');
const backend = createRequire(path.resolve('../backend/package.json'));
const { MongoMemoryReplSet } = backend('mongodb-memory-server');
const mongoose = backend('mongoose');
const { WebSocket } = backend('ws');
const { createServer } = require('node:http');
Object.assign(process.env, { CLIENT_URL: 'http://localhost:3000', COLLABORATION_SECRET: 'test-collaboration-secret-at-least-32-characters', GOOGLE_AUTH_CLIENT_ID: 'test', GOOGLE_AUTH_CLIENT_SECRET: 'test', GOOGLE_CALLBACK_URL: 'http://localhost:5000/auth/google/callback', MONGO_CONN: 'mongodb://127.0.0.1:1', MONGO_DB_NAME: 'disposable_live_review', SESSION_SECRET: 'test-session-secret-at-least-32-characters-long' });
(async () => {
 const { pathToFileURL } = require('node:url');
 const load = file => import(pathToFileURL(path.resolve('../backend/dist', file)).href);
 const { default: Note } = await load('models/note.model.js');
 const { default: User } = await load('models/user.model.js');
 const { default: DeviceSession } = await load('models/deviceSession.model.js');
 const { attachCollaborationServer, shutdownCollaborationServer, collaborationServer } = await load('collaboration/server.js');
 const { createCollaborationToken } = await load('util/collaborationToken.js');
 const replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.16' }, replSet: { count: 1 } });
 const server = createServer(); let context; const connections = new Set();
 try {
  await mongoose.connect(replica.getUri(), { dbName: 'disposable_live_review' });
  const owner = await User.create({ username: 'Live review', email: 'live@example.test' });
  const sessionHash = require('node:crypto').randomBytes(32).toString('hex');
  await DeviceSession.create({ userId: owner.id, sessionHash, expiresAt: new Date(Date.now() + 3600000) });
  const peer = await User.create({ username: 'Peer', email: 'peer@example.test' });
  const note = await Note.create({ owner: owner._id, title: 'Live recovery', type: 'document', content: 'server baseline', sharedWith: [{ userId: peer._id, permission: 'editor' }] });
  attachCollaborationServer(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
  context = await browser.newContext();
  let dropOutgoing = false;
  await context.route('**/api/**', async route => {
   const endpoint = new URL(route.request().url()).pathname;
   let body;
   if (endpoint.endsWith('/getUser')) body = { user: { _id: owner.id, username: owner.username, email: 'live@example.test' } };
   else if (endpoint.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (endpoint.endsWith('/collaboration-token')) body = { token: createCollaborationToken(note.id, owner.id, sessionHash) };
   else if (endpoint.endsWith('/shared')) body = [];
   else { const current = (await Note.findById(note.id)).toObject(); body = endpoint.endsWith('/notes') ? [current] : current; }
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.routeWebSocket('**/collaboration', route => {
   const socket = new WebSocket('ws://127.0.0.1:' + server.address().port + '/collaboration', { origin: 'http://localhost:3000' });
   connections.add(socket); const pending = [];
   socket.on('open', () => { for (const item of pending) socket.send(item); pending.length = 0; });
   route.onMessage(message => { if (dropOutgoing) return; if (socket.readyState === WebSocket.OPEN) socket.send(message); else pending.push(message); });
   socket.on('message', message => route.send(message));
   socket.on('close', () => { connections.delete(socket); route.close(); });
   socket.on('error', () => route.close());
   route.onClose(() => { connections.delete(socket); socket.close(); });
  });
  const open = async () => { const page = await context.newPage(); await page.goto((process.env.REVIEW_URL || 'http://127.0.0.1:3011') + '/notes/'); await page.getByRole('textbox', { name: 'Visual document editor' }).waitFor({ timeout: 30000 }); await page.getByRole('button', { name: 'Markdown', exact: true }).click(); return page; };
  let page = await open();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('durably saved');
  await expect.poll(async () => (await Note.findById(note.id)).content, { timeout: 15000 }).toBe('durably saved');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10000 });
  dropOutgoing = true;
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('offline live edit');
  await expect.poll(async () => page.evaluate(() => new Promise(resolve => { const open = indexedDB.open('thyncspace-browser-drafts', 2); open.onsuccess = () => { const db = open.result; const get = db.transaction('private-note-drafts-v2').objectStore('private-note-drafts-v2').getAll(); get.onsuccess = () => { db.close(); resolve(get.result.some(d => d.baseRevisionKey === 'yjs-v1' && atob(d.value).includes('offline live edit'))); }; }; }))).toBe(true);
  await page.close(); dropOutgoing = false;
  page = await open();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue('offline live edit');
  await expect.poll(async () => (await Note.findById(note.id)).content, { timeout: 15000 }).toBe('offline live edit');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10000 });
  await context.close(); context = null; await browser.close();
  console.log('Real MongoDB + WebSocket + Chrome: durable receipts and pending live edits surviving page shutdown passed.');
 } finally {
  if (context) await context.browser().close();
  for (const socket of connections) socket.terminate();
  await shutdownCollaborationServer(); await collaborationServer.hooks('onDestroy', {});
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); await replica.stop();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

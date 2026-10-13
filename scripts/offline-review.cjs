const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const directory = path.resolve(__dirname, '../out');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
(async () => {
 const server = http.createServer((request, response) => {
  try {
   const url = new URL(request.url, 'http://localhost'), file = path.resolve(directory, '.' + decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
   if (!file.startsWith(directory + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
   response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); response.setHeader('Cache-Control', 'no-cache'); fs.createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end(); }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const owner = { _id: '64b000000000000000000001', username: 'Offline owner' }; let user = owner, disconnected = false, writes = 0, loseReceipt = false, holdAuth = false, releaseAuth;
  let note = { _id: '64b000000000000000000002', owner: owner._id, title: 'Offline research', type: 'document', content: 'Original server text', sharedWith: [], favoritedBy: [], contentRevision: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const errors = [];
  context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept()); });
  await context.route('**/api/**', async route => {
   if (disconnected) return route.abort('internetdisconnected');
   const req = route.request(), pathname = new URL(req.url()).pathname; let body, status = 200;
   if (pathname.endsWith('/getUser')) { if (holdAuth) await new Promise(resolve => { releaseAuth = resolve; }); body = { user }; }
   else if (pathname.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (pathname.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (pathname.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (pathname.endsWith('/shared')) body = [];
   else if (pathname.endsWith('/notes')) body = [note];
   else if (pathname.endsWith('/private')) {
    expect(req.headers()['x-account-id']).toBe(owner._id);
    const input = req.postDataJSON();
    if (input.expectedRevision !== note.contentRevision || note.sharedWith.length || user._id !== owner._id) { status = 409; body = { error: 'Conflict or changed access' }; }
    else { writes++; note = { ...note, content: input.text, contentRevision: note.contentRevision + 1 }; body = note; if (loseReceipt) { loseReceipt = false; return route.abort('failed'); } }
   } else if (pathname.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const workspace = await context.newPage(); await workspace.goto(origin + '/notes/', { waitUntil: 'domcontentloaded' }); await expect(workspace.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible();
  await workspace.getByRole('button', { name: 'Commands', exact: true }).click(); await workspace.getByRole('textbox', { name: 'Find a note or command' }).fill('Make selected note');
  const opened = context.waitForEvent('page'); await workspace.getByRole('button', { name: 'Make selected note available offline Action' }).click(); const page = await opened; await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: 'Offline library', exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.reload(); await expect(page.getByRole('button', { name: 'Offline research Cached copy', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/offline-library/')))).toBe(true);
  await page.getByRole('button', { name: 'Offline research Cached copy', exact: true }).click();
  await context.setOffline(true); disconnected = true;
  await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.getByRole('heading', { name: 'Offline library', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Offline research Cached copy', exact: true }).click();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown source' }); await expect(editor).toBeVisible(); await editor.fill('Edited while offline');
  await page.getByRole('button', { name: 'Queue changes on this device', exact: true }).click(); await expect(page.getByText('Edits saved on this device and queued for synchronization.', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Offline research Queued edits', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toContainText('Edited while offline'); expect(writes).toBe(0);
  await context.setOffline(false); disconnected = false; user = { _id: '64b000000000000000000003', username: 'Other account' };
  holdAuth = true; await page.getByRole('button', { name: 'Synchronize queue (1)' }).click(); await expect.poll(() => typeof releaseAuth).toBe('function'); await expect(page.locator('.offline-editor')).toHaveAttribute('inert', ''); holdAuth = false; releaseAuth(); await expect(page.getByRole('main').getByRole('alert')).toContainText('Sign in to the account'); expect(writes).toBe(0);
  user = owner; note.content = 'Changed on another device'; note.contentRevision++;
  await page.getByRole('button', { name: 'Synchronize queue (1)' }).click(); await expect(page.getByText('0 synchronized; 1 retained for retry or conflict review.', { exact: true })).toBeVisible(); expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Compare with server', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Current server version', exact: true })).toHaveValue('Changed on another device');
  await page.getByRole('button', { name: 'Use offline version', exact: true }).click(); await expect(page.getByText('Reviewed offline version synchronized.', { exact: true })).toBeVisible(); expect(note.content).toBe('Edited while offline'); expect(writes).toBe(1);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await editor.fill('Saved despite a lost response'); await page.getByRole('button', { name: 'Queue changes on this device', exact: true }).click(); loseReceipt = true;
  await page.getByRole('button', { name: 'Synchronize queue (1)' }).click(); await expect(page.getByText('0 synchronized; 1 retained for retry or conflict review.', { exact: true })).toBeVisible(); expect(writes).toBe(2);
  await page.getByRole('button', { name: 'Synchronize queue (1)' }).click(); await expect(page.getByText('1 synchronized; 0 retained for retry or conflict review.', { exact: true })).toBeVisible(); expect(writes).toBe(2);
  await page.getByRole('button', { name: 'Markdown', exact: true }).click(); await editor.fill('Keep this queued copy'); await page.getByRole('button', { name: 'Queue changes on this device', exact: true }).click(); note.sharedWith = [{ userId: '64b000000000000000000003', permission: 'editor' }];
  await page.getByRole('button', { name: 'Synchronize queue (1)' }).click(); await expect(page.getByRole('main').getByRole('alert')).toContainText('shared or no longer owned'); expect(writes).toBe(2);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download current edit', exact: true }).click(); expect((await download).suggestedFilename()).toBe('offline-note.md');
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/offline-${width}.png` }); }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async ({ owner }) => {
   const database = await new Promise((resolve, reject) => { const request = indexedDB.open('thyncspace-offline-library', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
   await new Promise((resolve, reject) => { const transaction = database.transaction('notes', 'readwrite'), store = transaction.objectStore('notes');
    for (const entry of [{ noteId: '64b000000000000000000010', title: 'Offline board', type: 'whiteboard', baseContent: JSON.stringify({ elements: [], viewport: { panX: 0, panY: 0, zoom: 1 } }), editable: true }, { noteId: '64b000000000000000000011', title: 'Shared reference', type: 'document', baseContent: 'Read this shared copy', editable: false }]) store.put({ account: owner._id, username: owner.username, baseRevision: 0, pending: null, revision: 0, cachedAt: new Date().toISOString(), changedAt: new Date().toISOString(), ...entry });
    transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
   }); database.close();
  }, { owner });
  await page.getByRole('button', { name: 'Reload local library', exact: true }).click();
  await page.getByRole('button', { name: 'Offline board Cached copy', exact: true }).click();
  await page.getByTitle(/^Rectangle \(/).click();
  const canvas = page.locator('.offline-board canvas').first(); await canvas.scrollIntoViewIfNeeded(); const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + 200, bounds.y + 200); await page.mouse.down(); await page.mouse.move(bounds.x + 350, bounds.y + 320, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Queue changes on this device', exact: true }).click();
  await expect(page.getByText('Edits saved on this device and queued for synchronization.', { exact: true })).toBeVisible();
  const board = await page.evaluate(async account => { const database = await new Promise(resolve => { const request = indexedDB.open('thyncspace-offline-library', 1); request.onsuccess = () => resolve(request.result); }); const transaction = database.transaction('notes', 'readonly'); const request = transaction.objectStore('notes').get([account, '64b000000000000000000010']); const entry = await new Promise(resolve => { request.onsuccess = () => resolve(request.result); }); database.close(); return JSON.parse(entry.pending); }, owner._id); expect(board.elements.length).toBe(1);
  disconnected = true; await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Offline board Queued edits', exact: true }).click(); await expect(page.locator('.offline-board canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Shared reference Cached copy · Read only', exact: true }).click(); await expect(page.getByText('Read this shared copy', { exact: true })).toBeVisible(); await expect(page.locator('[contenteditable=true]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Queue changes on this device', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  console.log('Production offline shell, explicit cache, disconnected reload/edit queue, account checks, conflict review, lost-receipt retry, sharing changes, board persistence, shared read-only copies and mobile layout passed.');
 } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

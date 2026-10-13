const { chromium, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [], user = { _id: '64b000000000000000000001', username: 'Archive owner' }, now = new Date().toISOString();
  const source = { _id: '64b000000000000000000002', owner: user._id, title: 'Saved original', type: 'document', content: 'Original stays unchanged.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now };
  const records = [{ kind: 'note', id: source._id, data: { title: '<img src=x onerror=alert(1)> Archived document', type: 'document', content: Buffer.from(source.content).toString('base64'), contentEncoding: 'base64', status: 'active', notebook: 'Research/Physics', tags: [], linkedSources: [] } }, { kind: 'attachment', id: '64b000000000000000000009', data: { name: 'measurements.txt', mime: 'text/plain', data: Buffer.from('mass').toString('base64'), references: [source._id], ocrText: '' } }];
  const hash = text => createHash('sha256').update(text).digest('hex'), digest = hash(records.map(record => hash(JSON.stringify(record)) + '\n').join(''));
  const lines = [{ kind: 'manifest', format: 'thyncspace-workspace', version: 1 }, ...records, { kind: 'complete', records: 2, notes: 1, files: 1, digest }], archive = lines.map(line => JSON.stringify(line) + '\n').join('');
  const notes = [source]; let job = null, batches = 0, commits = 0, lostUpload = true, lostCommit = true, brokenExport = false;
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = notes;
   else if (path.endsWith('/archive/export')) { expect(req.headers()['x-account-id']).toBe(user._id); await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: brokenExport ? lines.slice(0, -1).map(line => JSON.stringify(line) + '\n').join('') : archive }); return; }
   else if (path.endsWith('/archive/import')) {
    expect(req.headers()['x-account-id']).toBe(user._id);
    if (req.method() === 'GET') body = job;
    else {
     const input = req.postDataJSON(); expect(req.headers()['x-csrf-token']).toBe('fixture');
     if (input.action === 'start') { expect(input.digest).toBe(digest); job = { clientId: input.clientId, digest, expected: 2, next: 0, status: 'loading', notes: 1, files: 1, reusedFiles: 0, noteIds: [], expiresAt: new Date(Date.now() + 3600000).toISOString() }; }
     if (input.action === 'batch') { batches++; expect(input.records).toEqual(records); expect(input.index).toBe(0); job.next = 2; if (lostUpload) { status = 503; body = { error: 'Simulated lost upload receipt. Resume safely.' }; lostUpload = false; } }
     if (input.action === 'commit') { commits++; expect(input.confirmation).toBe('RESTORE PRIVATE COPIES'); job.status = 'complete'; job.noteIds = ['64b000000000000000000003']; notes.push({ ...source, _id: job.noteIds[0], title: 'Restored document' }); if (lostCommit) { status = 503; body = { error: 'Simulated lost commit receipt. Refresh progress.' }; lostCommit = false; } }
     if (input.action === 'cancel') job = null;
     if (status === 200) body = job;
    }
   } else { const note = notes.find(note => path.endsWith('/' + note._id)); if (note) body = note; else { status = 404; body = { error: 'Unexpected fixture route' }; } }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  const open = async () => { await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Workspace archive'); await page.getByRole('button', { name: 'Workspace archive Action' }).click(); };
  await open(); const dialog = page.getByRole('dialog', { name: 'Workspace archive', exact: true }), restore = dialog.getByRole('button', { name: 'Restore private copies', exact: true }), input = dialog.getByLabel('Workspace archive file', { exact: true });
  await expect(restore).toBeDisabled(); expect(batches).toBe(0);
  brokenExport = true; await dialog.getByRole('button', { name: 'Download workspace archive', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('interrupted');
  brokenExport = false; const download = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download workspace archive', exact: true }).click(); const downloaded = await download; expect(downloaded.suggestedFilename()).toBe('thyncspace-workspace.jsonl'); expect(fs.readFileSync(await downloaded.path(), 'utf8')).toContain(digest);
  await input.setInputFiles({ name: 'invalid.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(archive.replace(digest, '0'.repeat(64))) }); await expect(dialog.getByRole('alert')).toContainText('checksum'); await expect(restore).toBeDisabled(); expect(batches).toBe(0);
  const choose = () => input.setInputFiles({ name: 'workspace.jsonl', mimeType: 'application/x-ndjson', buffer: Buffer.from(archive) });
  await choose(); await expect(dialog.getByLabel('Archive preview')).toContainText('1 note'); expect(await dialog.locator('img').count()).toBe(0); await expect(restore).toBeDisabled(); await dialog.getByRole('checkbox').check(); await restore.click(); await expect(dialog.getByRole('alert')).toContainText('lost upload'); expect(notes).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Close archive', exact: true }).click(); await open(); await expect(dialog.getByText(/2\/2 records uploaded/)).toBeVisible(); await choose(); await dialog.getByRole('checkbox').check(); await restore.click(); await expect(dialog.getByRole('alert')).toContainText('lost commit'); expect(notes).toHaveLength(2); expect(batches).toBe(1); expect(commits).toBe(1);
  await dialog.getByRole('button', { name: 'Refresh import progress', exact: true }).click(); await expect(dialog.getByText(/Restored 1 note and 1 file/)).toBeVisible(); await expect(restore).toBeDisabled(); expect(commits).toBe(1);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/archive-${width}.png` }); }
  await dialog.getByRole('button', { name: 'Dismiss restore receipt', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Dismiss restore receipt', exact: true })).toHaveCount(0); expect(notes).toHaveLength(2); expect(source.content).toBe('Original stays unchanged.'); expect(errors).toEqual([]);
  console.log('Archive completion checks, exact-account requests, preview/consent, resumable upload, lost commit receipt, private-copy preservation and responsive layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

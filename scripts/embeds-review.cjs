const { chromium, expect } = require('@playwright/test');
const { createTextElement } = require('@sunaissu/noteboard');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Source owner' }, now = new Date().toISOString();
  const host = { _id: '64b000000000000000000002', owner: user._id, title: 'Working document', type: 'document', content: 'Host writing stays independent.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now, linkedSources: [] };
  const source = { ...host, _id: '64b000000000000000000003', title: 'Reference document', content: 'Source excerpt for review' };
  const board = { ...host, _id: '64b000000000000000000004', title: 'Reference board', type: 'whiteboard', content: JSON.stringify({ elements: [createTextElement({ text: 'Board source label', x: 40, y: 40, width: 220, height: 28 })], viewport: { panX: 0, panY: 0, zoom: 1 } }) };
  let revision = 0, available = true; const errors = [];
  const sources = [source, board], list = () => ({ revision, canEdit: true, entries: host.linkedSources.map(link => { const note = sources.find(note => note._id === link.noteId); return { ...link, available, title: available ? note.title : 'Unavailable source', type: available ? note.type : undefined, sourceRevision: note.contentRevision, reviewedRevision: link.sourceRevision, stale: note.contentRevision !== link.sourceRevision }; }) });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const req = route.request(), pathname = new URL(req.url()).pathname; let body, status = 200;
   if (pathname.endsWith('/getUser')) body = { user };
   else if (pathname.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (pathname.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (pathname.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (pathname.endsWith('/shared')) body = [];
   else if (pathname.endsWith('/notes')) body = [host, source, board];
   else if (pathname.endsWith('/embeds')) {
    if (req.method() === 'PATCH') { const input = req.postDataJSON(); expect(input.expectedRevision).toBe(revision); const note = sources.find(note => note._id === input.sourceId);
     if (input.action === 'add') host.linkedSources.push({ noteId: note._id, sourceRevision: note.contentRevision });
     if (input.action === 'select') { expect(input.expectedSourceRevision).toBe(note.contentRevision); host.linkedSources.find(link => link.noteId === note._id).selection = input.selection; }
     if (input.action === 'review') { expect(input.expectedSourceRevision).toBe(note.contentRevision); host.linkedSources.find(link => link.noteId === note._id).sourceRevision = note.contentRevision; }
     if (input.action === 'remove') host.linkedSources = host.linkedSources.filter(link => link.noteId !== input.sourceId);
     revision++;
    } body = list();
   } else if (pathname.includes('/embeds/')) { const note = sources.find(note => pathname.endsWith('/' + note._id)); if (!available) { status = 404; body = { error: 'Source access removed' }; } else body = { noteId: note._id, title: note.title, type: note.type, content: note.content, revision: note.contentRevision, updatedAt: note.updatedAt, selection: host.linkedSources.find(link => link.noteId === note._id)?.selection }; }
   else if (pathname.endsWith('/' + host._id)) body = host;
   else if (pathname.endsWith('/private')) body = host;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Linked sources'); await page.getByRole('button', { name: 'Linked sources Action' }).click();
  const section = page.getByRole('region', { name: 'Linked sources', exact: true }); await section.getByLabel('Source to link', { exact: true }).selectOption(source._id); await section.getByRole('button', { name: 'Link source', exact: true }).click();
  await expect(section.getByText('Source excerpt for review', { exact: true })).toBeVisible();
  await section.getByText('Choose document excerpt', { exact: true }).click(); await section.getByRole('button', { name: 'Use selected lines', exact: true }).click(); await expect(section.getByText('Lines 1–1', { exact: true })).toBeVisible();
  const downloaded = page.waitForEvent('download'); await section.getByRole('button', { name: 'Download static source', exact: true }).click(); const download = await downloaded; const exported = fs.readFileSync(await download.path(), 'utf8'); expect(exported).toContain('Source excerpt for review'); expect(exported).toContain('noteId=' + source._id); expect(exported).toContain('Content-Security-Policy');
  source.content = 'Updated source excerpt'; source.contentRevision = 1;
  await section.getByRole('button', { name: 'Refresh sources', exact: true }).click(); await expect(section.getByRole('alert')).toContainText('The source changed. Choose the excerpt'); await expect(section.getByRole('button', { name: 'Download static source', exact: true })).toBeDisabled(); await expect(section.getByText('Source changed since last reviewed', { exact: true })).toBeVisible();
  await section.getByText('Choose document excerpt', { exact: true }).click(); await section.getByRole('button', { name: 'Use selected lines', exact: true }).click(); await expect(section.getByText('Updated source excerpt', { exact: true })).toBeVisible();
  await section.getByRole('button', { name: 'Mark this revision reviewed', exact: true }).click(); await expect(section.getByText('Source changed since last reviewed', { exact: true })).toHaveCount(0);
  await section.getByLabel('Source to link', { exact: true }).selectOption(board._id); await section.getByRole('button', { name: 'Link source', exact: true }).click(); await expect(section.locator('.linked-board-preview canvas').first()).toBeVisible();
  await section.getByText('Choose board objects', { exact: true }).click(); await section.getByRole('checkbox', { name: /Board source label/ }).check(); await section.getByRole('button', { name: 'Use 1 selected objects', exact: true }).click(); await expect(section.getByText('1 selected board objects', { exact: true })).toBeVisible();
  const boardDownloaded = page.waitForEvent('download'); await section.getByRole('button', { name: 'Download static source', exact: true }).click(); const boardDownload = await boardDownloaded; const boardExport = fs.readFileSync(await boardDownload.path(), 'utf8'); expect(boardExport).toContain('data:image/png;base64,'); expect(boardExport).toContain('Board source label');
  const editor = page.getByRole('textbox', { name: 'Visual document editor' }); const box = await editor.boundingBox(); expect(box.width).toBeGreaterThan(700); expect(box.height).toBeGreaterThan(100);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); expect(await section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); await section.locator(".linked-board-preview").scrollIntoViewIfNeeded(); await expect.poll(async () => section.locator(".linked-board-preview canvas").first().evaluate(canvas => canvas.width > 0)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await section.locator(".linked-board-preview").screenshot({ path: `test/artifacts/selected-board-${width}.png` }); await page.screenshot({ path: `test/artifacts/embeds-${width}.png` }); }
  expect(host.content).toBe('Host writing stays independent.');
  host.type = 'whiteboard'; host.content = JSON.stringify({ elements: [], viewport: { panX: 0, panY: 0, zoom: 1 } }); await page.setViewportSize({ width: 1440, height: 950 }); await page.reload();
  await page.getByRole('button', { name: 'Linked sources (2)', exact: true }).click(); await section.getByRole('button', { name: 'Preview source', exact: true }).last().click();
  await expect(page.locator('.whiteboard-editor-canvas canvas').first()).toBeVisible(); await expect(section.locator('.linked-board-preview canvas').first()).toBeVisible(); expect((await page.locator('.whiteboard-editor-canvas canvas').first().boundingBox()).height).toBeGreaterThan(100);
  available = false; await section.getByRole('button', { name: 'Refresh sources', exact: true }).click(); await expect(section.locator('canvas')).toHaveCount(0); await expect(section.getByText('This source is currently unavailable.', { exact: true })).toBeVisible(); await expect(section.getByText('Updated source excerpt', { exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: 'Unlink source', exact: true }).first().click(); await section.getByRole('button', { name: 'Unlink source', exact: true }).click(); await expect(section.getByText('No linked sources yet.', { exact: false })).toBeVisible(); expect(errors).toEqual([]);
  console.log('Linked document/board previews, revision review, revoked-source cleanup, full-width editor and mobile panel layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

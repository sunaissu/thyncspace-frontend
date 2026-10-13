const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';

(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'File owner' };
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Research', type: 'document', content: 'Reference files', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const files = [], contents = new Map(), errors = []; let savedIndex = { text: '', indexedAt: null, revision: 0 }; const assetRequests = [];
  page.on('request', request => { if (/ocr|tesseract|traineddata/.test(request.url())) assetRequests.push(request.url()); });
  await page.route('**/ocr/worker.min.js', async route => { const response = await route.fetch(); await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'" } }); });
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(); let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/' + note._id)) body = note;
   else if (path === '/api/attachments' && method === 'GET') body = { files: files.filter(file => (file.name + savedIndex.text).toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()) && (!url.searchParams.get('noteId') || file.references.some(ref => ref.noteId === url.searchParams.get('noteId')))), truncated: false, usage: { count: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }, limits: { accountBytes: 50 * 1048576, count: 100, fileBytes: 2 * 1048576 } };
   else if (path === '/api/attachments' && method === 'POST') {
    const input = req.postDataJSON(), id = (files.length + 10).toString(16).padStart(24, '0'), data = Buffer.from(input.data, 'base64');
    body = { id, name: input.name, mime: input.mime, bytes: data.length, owner: user._id, references: [], createdAt: new Date().toISOString() }; files.push(body); contents.set(id, data); status = 201;
   } else if (path.startsWith('/api/attachments/')) {
    const id = path.split('/')[3], file = files.find(file => file.id === id);
    if (path.endsWith('/index')) { if (method === 'PUT') { const input = req.postDataJSON(); expect(input.consent).toBe(true); expect(input.expectedRevision).toBe(savedIndex.revision); savedIndex = { text: input.text, revision: savedIndex.revision + 1, indexedAt: input.text ? new Date().toISOString() : null }; } return route.fulfill({ contentType: 'application/json', body: JSON.stringify(savedIndex) }); }
    if (path.endsWith('/content')) return route.fulfill({ contentType: file.mime, body: contents.get(id) });
    if (path.endsWith('/references')) file.references = method === 'POST' ? [{ noteId: note._id, title: note.title }] : [];
    else if (method === 'DELETE') files.splice(files.findIndex(file => file.id === id), 1);
    status = 204;
   } else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Attachments'); await page.getByRole('button', { name: 'Attachments Action' }).click();
  const dialog = page.getByRole('dialog', { name: 'Attachments', exact: true }), upload = dialog.getByLabel('Upload file');
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 200; const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 200); ctx.fillStyle = 'black'; ctx.font = '48px Arial'; ctx.fillText('ORBITAL RESEARCH 2026', 30, 100); return canvas.toDataURL('image/png').split(',')[1]; });
  await upload.setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await dialog.getByText('Image text and search', { exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Recognize image text' })).toBeDisabled(); expect(savedIndex.text).toBe(''); expect(assetRequests).toEqual([]);
  await dialog.getByRole('checkbox', { name: 'I want to process this selected image.' }).check();
  await dialog.getByRole('button', { name: 'Recognize image text' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Review search text' })).toHaveValue(/ORBITAL RESEARCH 2026/, { timeout: 90000 });
  expect(savedIndex.text).toBe('');
  await dialog.getByRole('textbox', { name: 'Review search text' }).fill('Orbital research reviewed');
  await dialog.getByRole('button', { name: 'Save reviewed text to search' }).click(); await expect(dialog.getByText('Search text saved for this image.', { exact: true })).toBeVisible();
  expect(savedIndex.text).toBe('Orbital research reviewed');
  await dialog.getByLabel('Search files').fill('Orbital'); await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click(); await dialog.getByText('Image text and search', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Review search text' })).toHaveValue('Orbital research reviewed');
  await dialog.getByRole('button', { name: 'Remove search text', exact: true }).click(); await expect(dialog.getByText('Search text removed.', { exact: true })).toBeVisible(); expect(savedIndex.text).toBe('');
  expect(assetRequests.length).toBeGreaterThan(0); expect(assetRequests.every(url => new URL(url).origin === origin)).toBe(true); expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/ocr-390.png' });
  console.log('Real local OCR under worker CSP, explicit consent, review-before-save, searchable text, reload and removal passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

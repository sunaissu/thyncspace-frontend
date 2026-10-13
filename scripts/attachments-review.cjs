const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
function pdfFixture() {
 const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 const stream = 'BT /F1 18 Tf 30 100 Td (Attachment review) Tj ET'; objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
 let data = '%PDF-1.4\n', offsets = [0]; objects.forEach((object, index) => { offsets.push(Buffer.byteLength(data)); data += `${index + 1} 0 obj\n${object}\nendobj\n`; });
 const xref = Buffer.byteLength(data); data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return Buffer.from(data);
}
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'File owner' };
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Research', type: 'document', content: 'Reference files', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const files = [], contents = new Map(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url()), path = url.pathname, method = req.method(); let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/' + note._id)) body = note;
   else if (path === '/api/attachments' && method === 'GET') body = { files: files.filter(file => file.name.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()) && (!url.searchParams.get('noteId') || file.references.some(ref => ref.noteId === url.searchParams.get('noteId')))), truncated: false, usage: { count: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0) }, limits: { accountBytes: 50 * 1048576, count: 100, fileBytes: 2 * 1048576 } };
   else if (path === '/api/attachments' && method === 'POST') {
    const input = req.postDataJSON(), id = (files.length + 10).toString(16).padStart(24, '0'), data = Buffer.from(input.data, 'base64');
    body = { id, name: input.name, mime: input.mime, bytes: data.length, owner: user._id, references: [], createdAt: new Date().toISOString() }; files.push(body); contents.set(id, data); status = 201;
   } else if (path.startsWith('/api/attachments/')) {
    const id = path.split('/')[3], file = files.find(file => file.id === id);
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
  await upload.setInputFiles({ name: 'research.txt', mimeType: 'text/plain', buffer: Buffer.from('<script>window.untrusted = true</script>\nPrivate reference text') });
  await expect(dialog.getByText('File saved privately.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click(); await expect(dialog.locator('pre')).toContainText('<script>'); expect(await page.evaluate(() => window.untrusted)).toBeUndefined();
  const downloaded = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download file', exact: true }).click(); expect((await downloaded).suggestedFilename()).toBe('research.txt');
  await dialog.getByRole('button', { name: 'Link to selected note' }).click(); await expect(dialog.getByRole('button', { name: 'Unlink from Research' })).toBeVisible();
  await dialog.getByLabel('Show', { exact: true }).selectOption('note'); await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Unlink from Research' }).click(); await expect(dialog.getByText('No files for this selection.')).toBeVisible();
  await dialog.getByLabel('Show', { exact: true }).selectOption('mine');
  await upload.setInputFiles({ name: 'reference.pdf', mimeType: 'application/pdf', buffer: pdfFixture() });
  await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: 'reference.pdf', exact: true }).click(); await expect(dialog.getByText('Page 1 of 1', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect.poll(() => dialog.locator('canvas').evaluate(node => { const data = node.getContext('2d').getImageData(0, 0, node.width, node.height).data; return [...data].some((value, index) => index % 4 !== 3 && value < 200); })).toBe(true);
  await dialog.getByLabel('Search files').fill('research'); await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(1); await dialog.getByLabel('Search files').fill('');
  for (const width of [1440, 390, 320]) {
   await page.setViewportSize({ width, height: 950 }); await expect(dialog.getByRole('button', { name: 'reference.pdf', exact: true })).toBeVisible(); await dialog.getByRole('button', { name: 'reference.pdf', exact: true }).click(); await expect(dialog.getByText('Page 1 of 1', { exact: true })).toBeVisible();
   expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/attachments-${width}.png` });
  }
  await upload.setInputFiles({ name: 'too-big.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2 * 1048576 + 1) }); await expect(dialog.getByRole('alert')).toContainText('2 MiB'); expect(files.length).toBe(2);
  await dialog.getByRole('button', { name: 'Delete file', exact: true }).first().click(); await expect(dialog.getByRole('button', { name: 'Preview', exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); expect(errors).toEqual([]);
  console.log('Attachment upload, text escaping, download, references, filters, PDF canvas, quota validation and mobile layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

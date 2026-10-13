const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Link reviewer' };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let imports = 0;
  const notes = ['Source', 'Reference'].map((title, index) => ({ _id: '64b00000000000000000000' + (index + 2), owner: user._id, title, type: 'document', content: '', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  await page.route('**/api/**', async route => {
   const request = route.request(), endpoint = new URL(request.url()).pathname;
   let body, status = 200;
   if (endpoint.endsWith('/getUser')) body = { user };
   else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (endpoint.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (endpoint.endsWith('/shared')) body = [];
   else if (endpoint.endsWith('/import')) {
    imports++; body = request.postDataJSON().notes.map((item, index) => ({ ...notes[0], _id: '64b00000000000000000001' + index, title: item.title, content: item.text, sourcePath: item.sourcePath }));
    notes.push(...body);
   } else if (endpoint.endsWith('/private')) {
    const note = notes.find(note => endpoint.includes(note._id)), input = request.postDataJSON();
    Object.assign(note, { content: input.text ?? note.content, contentRevision: note.contentRevision + 1 }); body = note;
   } else if (endpoint.endsWith('/notes')) body = notes;
   else { status = 404; body = { error: 'Unknown fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/');
  const visual = page.getByRole('textbox', { name: 'Visual document editor' });
  await visual.fill('[[Ref');
  await expect(page.getByRole('region', { name: 'Wiki-link suggestions' })).toBeVisible();
  await visual.press('Enter');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(source).toHaveValue('[[64b000000000000000000003|Reference]]');
  await source.fill('Prefix [[Ref'); await source.press('Enter');
  await expect(source).toHaveValue('Prefix [[64b000000000000000000003|Reference]]');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  const connections = page.getByRole('region', { name: 'Note connections' });
  await expect(connections.getByRole('img')).toHaveAttribute('aria-label', 'Graph of Source and 1 connected notes');
  await connections.getByRole('button', { name: 'Reference', exact: true }).first().click();
  await expect(connections.getByRole('heading', { name: 'Connections · Reference' })).toBeVisible();
  await expect(connections.getByRole('heading', { name: 'Backlinks', exact: true }).locator('..')).toContainText('Source');
  await expect(visual).toBeVisible();
  for (const width of [320, 390, 1440]) {
   await page.setViewportSize({ width, height: 950 });
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   require('node:fs').mkdirSync('test/artifacts', { recursive: true });
   await page.screenshot({ path: 'test/artifacts/connections-' + width + '.png' });
  }
  await page.getByRole('button', { name: 'Close connections', exact: true }).click();
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await page.getByRole('button', { name: 'Import Markdown Action', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Obsidian bridge' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type=file]').last().setInputFiles({ name: 'Source.md', mimeType: 'text/markdown', buffer: Buffer.from('[[Missing]] ![image](missing.png)') });
  const preview = page.getByRole('region', { name: 'Vault import preview' });
  await expect(preview).toContainText('Duplicate title: Source');
  await expect(preview).toContainText('Unresolved wiki link: Missing');
  await expect(preview).toContainText('Missing local asset: missing.png');
  expect(imports).toBe(0);
  await page.getByRole('button', { name: 'Import 1 private copies', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Imported 1 Markdown notes');
  expect(imports).toBe(1);
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('Visual/source wiki completion, stable links, backlinks, graph, responsive connections and explicit vault preview/import passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

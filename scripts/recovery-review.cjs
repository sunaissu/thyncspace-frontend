const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const context = await browser.newContext();
  const user = { _id: '64b000000000000000000002', username: 'Recovery test', email: 'review@example.test' };
  let note = { _id: '64b000000000000000000001', owner: user._id, title: 'Recovery', type: 'document', content: 'base', contentRevision: 0, sharedWith: [], favoritedBy: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let failSaves = false;
  await context.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname;
   let body = note, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/private')) {
    const input = req.postDataJSON();
    if (failSaves) { status = 503; body = { error: 'Storage unavailable' }; }
    else if (input.expectedRevision !== note.contentRevision) { status = 409; body = { error: 'Newer server revision' }; }
    else { note = { ...note, content: input.text, contentRevision: note.contentRevision + 1 }; body = note; }
   }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  for (const page of pages) {
   await page.goto(origin + '/notes/');
   await page.getByRole('textbox', { name: 'Visual document editor' }).waitFor();
   await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  }
  const source = page => page.getByRole('textbox', { name: 'Markdown source' });
  await source(pages[0]).fill('first tab');
  await expect.poll(() => note.content).toBe('first tab');
  await source(pages[1]).fill('second tab');
  await expect(pages[1].getByText('Choose which version of this note to keep')).toBeVisible({ timeout: 10000 });
  await expect(pages[1].getByLabel('Browser draft', { exact: true })).toHaveValue('second tab');
  await expect(pages[1].getByLabel('Server copy', { exact: true })).toHaveValue('first tab');
  const downloaded = pages[1].waitForEvent('download');
  await pages[1].getByRole('button', { name: 'Download both copies' }).click();
  expect((await downloaded).suggestedFilename()).toBe('note-conflict-copies.json');
  await pages[1].getByRole('button', { name: 'Restore browser draft', exact: true }).click();
  await expect.poll(() => note.content).toBe('second tab');
  failSaves = true;
  await pages[1].getByRole('button', { name: 'Markdown', exact: true }).click();
  await source(pages[1]).fill('offline draft');
  await expect(pages[1].getByText('Storage unavailable', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(pages[1].getByText('Unsaved changes', { exact: true })).toBeVisible();
  const drafts = await pages[1].evaluate(() => new Promise((resolve, reject) => {
   const req = indexedDB.open('thyncspace-browser-drafts', 2);
   req.onsuccess = () => { const db = req.result; const get = db.transaction('private-note-drafts-v2').objectStore('private-note-drafts-v2').getAll(); get.onsuccess = () => { db.close(); resolve(get.result); }; get.onerror = () => reject(get.error); };
   req.onerror = () => reject(req.error);
  }));
  expect(drafts.some(d => d.value === 'offline draft')).toBe(true);
  await browser.close();
  console.log('Two-tab stale-save rejection, conflict comparison/download/restore, failed-save status and durable browser draft passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

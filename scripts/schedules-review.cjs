const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Schedule reviewer' };
  const notes = [{ _id: '64b000000000000000000002', owner: user._id, title: 'Journal template', type: 'document', content: 'Daily plan', isTemplate: true, sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  let schedules = []; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const request = route.request(), endpoint = new URL(request.url()).pathname;
   let body, status = 200;
   if (endpoint.endsWith('/getUser')) body = { user };
   else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (endpoint.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (endpoint.endsWith('/shared')) body = [];
   else if (endpoint.endsWith('/daily')) {
    if (notes.length === 1) notes.push({ ...notes[0], _id: '64b000000000000000000003', title: 'Daily ' + request.postDataJSON().date, isTemplate: false });
    body = notes[1];
   } else if (endpoint.endsWith('/schedules')) {
    if (request.method() === 'POST') { body = { ...request.postDataJSON(), id: '64b000000000000000000004', isActive: true, nextRunAt: '2026-10-14T09:00:00Z' }; schedules.push(body); }
    else body = schedules;
   } else if (endpoint.includes('/schedules/')) {
    if (request.method() === 'DELETE') { schedules = []; status = 204; }
    else { schedules[0].isActive = request.postDataJSON().isActive; body = schedules[0]; }
   } else if (endpoint.endsWith('/private')) body = notes.find(note => endpoint.includes(note._id));
   else if (endpoint.endsWith('/notes')) body = notes;
   else { status = 404; body = { error: 'Unknown fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/');
  await page.getByRole('textbox', { name: 'Visual document editor' }).waitFor();
  const open = () => page.getByRole('button', { name: 'Daily notes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Daily and recurring notes' });
  await open();
  await dialog.getByRole('combobox', { name: 'Template', exact: true }).selectOption(notes[0]._id);
  await dialog.getByLabel('Daily note date', { exact: true }).fill('2026-10-13');
  await dialog.getByRole('button', { name: 'Open daily note', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toContainText('Daily plan');
  expect(notes).toHaveLength(2);
  await open(); await dialog.getByLabel('Daily note date', { exact: true }).fill('2026-10-13');
  await dialog.getByRole('button', { name: 'Open daily note', exact: true }).click();
  await expect(dialog).toBeHidden(); expect(notes).toHaveLength(2);
  await open();
  await dialog.getByRole('textbox', { name: 'Schedule title', exact: true }).fill('Morning review');
  await dialog.getByRole('button', { name: 'Create recurring notes', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Morning review', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Pause Morning review', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Resume Morning review', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Resume Morning review', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Pause Morning review', exact: true })).toBeVisible();
  for (const width of [320, 390, 1440]) {
   await page.setViewportSize({ width, height: 950 });
   expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  page.once('dialog', value => value.accept());
  await dialog.getByRole('button', { name: 'Remove Morning review', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Morning review', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace tools' }).getByRole('button', { name: 'Daily notes', exact: true }).click();
  await expect(dialog).toBeVisible();
  require('node:fs').mkdirSync('test/artifacts', { recursive: true });
  await page.screenshot({ path: 'test/artifacts/daily-390.png' });
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace tools' }).getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Note connections' })).toBeVisible();
  await page.getByRole('button', { name: 'Close connections', exact: true }).click();
  await page.screenshot({ path: 'test/artifacts/mobile-workspace-390.png' });
  expect(errors).toEqual([]);
  console.log('Daily note reuse, template content, recurring creation, pause/resume/removal and narrow dialog layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

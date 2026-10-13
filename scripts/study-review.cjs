const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Study owner' };
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Physics', type: 'document', content: 'Force: Mass times acceleration.\n\nQ: What is velocity?\nA: Displacement per unit time.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname;
   if (req.method() !== 'GET' && !path.endsWith('/workspace')) mutations.push(path);
   let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const open = async () => {
   await page.getByRole('button', { name: 'Commands', exact: true }).click();
   await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Study tools');
   await page.getByRole('button', { name: 'Study tools Action' }).click();
  };
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await open();
  const dialog = page.getByRole('dialog', { name: 'Study tools', exact: true });
  await dialog.getByRole('button', { name: 'Load note excerpt' }).click();
  await dialog.getByRole('button', { name: 'Create draft cards' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Question', exact: true })).toHaveCount(2);
  await dialog.getByRole('textbox', { name: 'Answer', exact: true }).first().fill('Mass multiplied by acceleration.');
  await dialog.getByRole('button', { name: 'Save card', exact: true }).first().click();
  await expect(dialog.getByRole('status')).toContainText('Card saved privately');
  await dialog.getByRole('button', { name: 'Save card', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Saved cards (2)' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close study tools' }).click();
  await page.reload(); await open();
  await expect(dialog.getByRole('heading', { name: 'Saved cards (2)' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Write answers before revealing' }).check();
  await dialog.getByRole('button', { name: 'Start practice' }).click();
  await dialog.getByRole('textbox', { name: 'Your answer' }).fill('My practice answer');
  await dialog.getByRole('button', { name: 'Reveal answer' }).click();
  await dialog.getByRole('button', { name: 'I knew this' }).click();
  await expect(dialog.getByText('Card 2 of 2 · Reviewed this round: 1, known: 1')).toBeVisible();
  await dialog.getByRole('button', { name: 'Return to deck' }).click();
  await dialog.getByText('What is Force?', { exact: true }).click();
  await expect(dialog.getByText('Mass multiplied by acceleration.', { exact: true })).toBeVisible();
  const exported = page.waitForEvent('download'); await dialog.getByRole('button', { name: 'Download cards and drafts' }).click(); expect((await exported).suggestedFilename()).toBe('thyncspace-study-cards.json');
  await dialog.getByRole('button', { name: 'Open source note' }).first().click(); await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace tools', exact: true }).getByRole('button', { name: 'Study tools', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Saved cards (2)' })).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/study-390.png' });
  expect(mutations).toEqual([]); expect(errors).toEqual([]);
  console.log('Selected-source drafts, editing, private persistence, question practice, export, source navigation and mobile study layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

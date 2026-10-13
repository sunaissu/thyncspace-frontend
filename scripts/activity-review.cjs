const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Activity owner' };
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Activity document', type: 'document', content: '# Review\n\nPrivate activity.', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  let attempts = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname;
   let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/activity')) { attempts++; body = { createdAt: note.createdAt, limit: 100, events: [{ id: '1', kind: 'share', at: note.updatedAt, actor: user.username, target: 'Teammate', permission: 'editor' }, { id: '2', kind: 'edit', at: note.updatedAt, actor: 'Live collaboration' }, { id: '3', kind: 'restore', at: note.updatedAt, actor: user.username, sourceVersionId: 'old-version' }] }; }
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Note activity' });
  await expect(dialog.getByText('Shared with Teammate as editor')).toBeVisible();
  await expect(dialog.getByText('Restored a retained version as this private copy')).toBeVisible();
  const initialAttempts = attempts;
  await dialog.getByRole('button', { name: 'Refresh activity' }).click();
  await expect.poll(() => attempts).toBe(initialAttempts + 1);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 950 });
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click();
  await page.getByRole('dialog', { name: 'Workspace tools', exact: true }).getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  fs.mkdirSync('test/artifacts', { recursive: true });
  await page.screenshot({ path: 'test/artifacts/activity-390.png' });
  await dialog.getByRole('button', { name: 'Close activity' }).click(); await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.screenshot({ path: 'test/artifacts/workspace-activity-1440.png' });
  expect(errors).toEqual([]);
  console.log('Activity event labels, refresh, Escape/close, mobile tools and dialog layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

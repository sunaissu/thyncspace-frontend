const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Reminder owner' }, now = new Date().toISOString();
  const note = { _id: '64b000000000000000000002', owner: user._id, title: 'Research review', type: 'document', content: '- [ ] Review orbital vectors due:2026-10-13', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now };
  let reminders = { revision: 0, entries: [] }; const errors = [], sent = [];
  await context.exposeFunction('recordNotification', (title, options) => sent.push({ title, options }));
  await context.addInitScript(() => {
   class FakeNotification { static permission = 'granted'; static requestPermission = async () => 'granted'; constructor(title, options) { window.recordNotification(title, options); } close() {} }
   window.Notification = FakeNotification;
  });
  await context.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/reminders')) {
    if (req.method() === 'PATCH') {
     const input = req.postDataJSON(); expect(input.expectedRevision).toBe(reminders.revision);
     if (input.action === 'create') { expect(input.sourceText).toBe(note.content); reminders.entries.push({ ...input, title: note.title, taskText: input.sourceText, available: true, sourceChanged: false, taskDone: false }); }
     else { const entry = reminders.entries.find(entry => entry.id === input.id); if (input.action === 'complete') entry.dueAt = new Date(Date.now() + 7 * 86400000).toISOString(); if (input.action === 'snooze') entry.dueAt = input.dueAt; if (input.action === 'delete') reminders.entries = reminders.entries.filter(entry => entry.id !== input.id); }
     reminders.revision++;
    } body = reminders;
   } else if (path.endsWith('/notes')) body = [note]; else if (path.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.goto(origin + '/notes/?reminders=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const dialog = page.getByRole('dialog', { name: 'Reminders', exact: true }); await expect(dialog).toBeVisible({ timeout: 60000 });
  await dialog.getByLabel('Source note', { exact: true }).selectOption(note._id); await dialog.getByLabel('Review', { exact: true }).selectOption('1');
  await dialog.getByLabel('When (your local time)', { exact: true }).fill(new Date(Date.now() - 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)); await dialog.getByLabel('Repeat review every', { exact: true }).selectOption('7');
  await dialog.getByRole('button', { name: 'Save reminder', exact: true }).click(); await expect(dialog.getByText('Private reminder saved.', { exact: true })).toBeVisible(); expect(sent.length).toBe(0);
  await dialog.getByRole('button', { name: 'Enable browser notifications', exact: true }).click(); await expect.poll(() => sent.length).toBe(1); expect(sent[0].options.body).not.toContain('orbital'); expect(sent[0].options.body).not.toContain(note.title);
  const other = await context.newPage(); await other.goto(origin + '/notes/', { waitUntil: 'domcontentloaded' }); await expect(other.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible(); await expect(other.getByText('1 / 100 reminders', { exact: true })).toBeAttached(); await other.evaluate(owner => navigator.locks.request('thyncspace-reminders:' + owner, () => true), user._id);
  await dialog.getByRole('button', { name: 'Refresh reminders', exact: true }).click(); expect(sent.length).toBe(1);
  await dialog.getByRole('button', { name: 'Reviewed · schedule next', exact: true }).click(); await expect(dialog.getByText(/^Upcoming ·/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Remind in 24 hours', exact: true }).click(); await expect.poll(() => Date.parse(reminders.entries[0].dueAt) - Date.now()).toBeLessThanOrEqual(86400000);
  reminders.entries[0].sourceChanged = true; reminders.revision++; await dialog.getByRole('button', { name: 'Refresh reminders', exact: true }).click(); await expect(dialog.getByText('The selected task moved or changed.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/reminders-390.png' });
  await dialog.getByRole('button', { name: 'Turn off browser notifications', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Enable browser notifications', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete reminder', exact: true }).click(); await expect(dialog.getByText('No reminders for this filter.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await expect(dialog).not.toBeVisible(); expect(errors).toEqual([]);
  console.log('Private task reminders, recurrence, snooze, changed-source warning, explicit generic notifications, cross-tab deduplication and mobile layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

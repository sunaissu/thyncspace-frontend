const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [], owner = '64b000000000000000000001', notes = []; let signedIn = false, invalid = false;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => { const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200;
   if (path.endsWith('/service-info')) body = { status: 'maintenance', notice: 'Scheduled maintenance. <img src=x onerror=alert(1)>', supportUrl: invalid ? 'javascript:alert(1)' : 'https://example.test/support', privacyUrl: 'https://example.test/privacy', termsUrl: 'https://example.test/terms', retention: 'Fixture retention statement', version: 'fixture', checkedAt: new Date().toISOString() };
   else if (path.endsWith('/getUser')) { status = signedIn ? 200 : 503; body = signedIn ? { user: { _id: owner, username: 'Template owner' } } : { error: 'Session service unavailable' }; }
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/notes') && req.method() === 'POST') { const input = req.postDataJSON(); expect(input.type).toBe('document'); expect(input.text).toContain('## '); expect(input.sharedWith).toBeUndefined(); expect(input.owner).toBeUndefined(); const now = new Date().toISOString(); body = { _id: (notes.length + 2).toString(16).padStart(24, '0'), owner, title: input.title, content: input.text, type: 'document', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now }; notes.push(body); }
   else if (path.endsWith('/notes')) body = notes;
   else { body = notes.find(note => path.endsWith('/' + note._id)); if (!body) { status = 404; body = { error: 'Unexpected route' }; } }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011'; await page.goto(origin + '/service/'); await expect(page.getByRole('status')).toHaveText('Maintenance'); await expect(page.getByRole('link', { name: 'Contact support or report abuse' })).toHaveAttribute('href', 'https://example.test/support'); await expect(page.locator('.service-page img')).toHaveCount(0);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/service-' + width + '.png', fullPage: true }); }
  invalid = true; await page.getByRole('button', { name: 'Refresh status' }).click(); await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be checked'); await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  signedIn = true; await page.goto(origin + '/notes/');
  const titles = ['Engineering design log', 'Lab notebook entry', 'Worked problem', 'Architecture decision record', 'Debugging investigation', 'Lecture and review', 'Experiment record', 'Project calculation sheet'];
  for (const title of titles) { if (!notes.length) await page.getByRole('button', { name: 'New note', exact: true }).click(); else { await page.getByRole('button', { name: 'Workspace tools', exact: true }).click(); await page.getByRole('dialog', { name: 'Workspace tools', exact: true }).getByRole('button', { name: 'New note', exact: true }).click(); } const dialog = page.getByRole('dialog', { name: 'Choose your note space' }); await dialog.getByText(title, { exact: true }).click(); await expect(dialog.getByLabel(title + ' preview')).toContainText('# ' + title); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); await dialog.getByRole('button', { name: 'Use ' + title, exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible(); }
  await page.getByRole('button', { name: 'Workspace tools', exact: true }).click(); await page.getByRole('dialog', { name: 'Workspace tools', exact: true }).getByRole('button', { name: 'New note', exact: true }).click(); const preview = page.getByRole('dialog', { name: 'Choose your note space' }); await preview.getByText(titles[0], { exact: true }).click();
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await preview.evaluate(node => node.scrollWidth <= node.clientWidth && node.getBoundingClientRect().height <= innerHeight)).toBe(true); await page.screenshot({ path: 'test/artifacts/templates-' + width + '.png' }); }
  await preview.getByRole('button', { name: 'Close new note dialog' }).click(); expect(notes).toHaveLength(8); expect(notes[7].content).toContain('does not import calculator'); expect(errors).toEqual([]);
  console.log('Public status during session outage, escaped incidents, safe policy links, eight private starter templates and narrow layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

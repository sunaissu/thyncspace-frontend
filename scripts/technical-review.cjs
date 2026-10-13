const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [], writes = [], owner = '64b000000000000000000001';
  const note = { _id: '64b000000000000000000002', owner, title: 'Technical document', type: 'document', content: '# Equations\n\nEnergy $E = mc^2$\n\n$$\n\\frac{1}{2} + \\sqrt{x}\n$$', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const original = note.content; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => { const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200; if (req.postData()) writes.push(req.postData());
   if (path.endsWith('/getUser')) body = { user: { _id: owner, username: 'Technical owner' } };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/notes')) body = [note];
   else if (path.endsWith('/private')) { note.content = req.postDataJSON().text; note.contentRevision++; body = note; }
   else if (path.endsWith('/' + note._id)) body = note;
   else { status = 404; body = { error: 'Unexpected route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto((process.env.REVIEW_URL || 'http://127.0.0.1:3011') + '/notes/');
  await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click(); await expect(page.locator('.document-math math')).toHaveCount(2); await expect(page.locator('.document-math math').last()).toBeVisible();
  fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/math-desktop.png' });
  await page.getByRole('button', { name: 'Calculator', exact: true }).click(); await page.getByText('Plot expression or data', { exact: true }).click();
  await page.getByLabel('Plot expression', { exact: true }).fill('37819*x'); await page.getByRole('button', { name: 'Draw plot', exact: true }).click(); await expect(page.getByRole('img', { name: /Sampled plot of 37819/ })).toBeVisible();
  for (const format of ['SVG', 'CSV']) { const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download ' + format, exact: true }).click(); const file = await pending; const content = fs.readFileSync(await file.path(), 'utf8'); if (format === 'SVG') expect(content).toContain('37819*x'); else expect(content).toMatch(/^x,y\n/); }
  await page.getByRole('button', { name: 'Data points', exact: true }).click(); await page.getByLabel('Data, one x,y pair per line').fill('0,0\n1,2\n2,5'); await page.getByRole('button', { name: 'Draw plot', exact: true }).click(); await expect(page.getByRole('img', { name: /Sampled plot of Measured data/ })).toBeVisible();
  await page.getByText('Plot values (3)', { exact: true }).click(); await expect(page.locator('.calculator-plot-table tbody tr')).toHaveCount(3);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); await page.locator('.calculator-plot figure').scrollIntoViewIfNeeded(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(await page.locator('.calculator-plot').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); await page.screenshot({ path: `test/artifacts/plot-${width}.png` }); }
  expect(writes.join('\n')).not.toContain('37819'); expect(note.content).toBe(original); expect(errors).toEqual([]);
  console.log('Native MathML preview, private expression/data plots, SVG/CSV downloads, responsive layouts, and no plot API writes passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

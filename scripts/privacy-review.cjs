const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Privacy owner' };
  let request = null, incomplete = true, writes = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname;
   let body, status = 200, contentType = 'application/json';
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/privacy/export')) { contentType = 'application/x-ndjson'; body = '{"kind":"profile","data":{"username":"Privacy owner"}}\n' + (incomplete ? '' : '{"kind":"complete","records":1}\n'); }
   else if (path.endsWith('/privacy/deletion')) {
    if (req.method() !== 'GET') {
     writes++; expect(req.headers()['x-account-id']).toBe(user._id);
     if (req.method() === 'POST') { expect(req.postDataJSON().confirmation).toBe(user.username); request = { id: 'private-request', status: 'pending', requestedAt: '2026-10-13T10:00:00Z' }; }
     else request = { ...request, status: 'cancelled' };
    }
    body = request;
   } else { status = 404; body = { error: 'Unexpected route' }; }
   await route.fulfill({ status, contentType, body: typeof body === 'string' ? body : JSON.stringify(body) });
  });
  await page.goto(origin + '/privacy/');
  await expect(page.getByRole('heading', { name: 'Account privacy', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request deletion', exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Download my data' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('export was incomplete');
  incomplete = false;
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('thyncspace-account.jsonl');
  await page.getByRole('textbox', { name: 'Type your username to confirm' }).fill(user.username);
  await page.getByRole('button', { name: 'Request deletion', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel deletion request' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cancel deletion request' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel deletion request' }).click();
  await expect(page.getByText('Your previous request was cancelled.')).toBeVisible();
  expect(writes).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log('Account export completion, explicit deletion request, persisted status, cancellation, and mobile layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

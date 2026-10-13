const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Capture owner' };
  let signedIn = false, attempts = 0, fail = true; const payloads = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const request = route.request(), endpoint = new URL(request.url()).pathname;
   let body, status = 200;
   if (endpoint.endsWith('/getUser')) { status = signedIn ? 200 : 401; body = signedIn ? { user } : { error: 'Sign in required' }; }
   else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (endpoint.endsWith('/capture')) {
    expect(request.headers()['x-account-id']).toBe(user._id);
    attempts++; payloads.push(request.postDataJSON());
    status = fail ? 503 : 200; body = fail ? { error: 'Temporary capture failure' } : { _id: '64b000000000000000000002' };
   } else { status = 404; body = { error: 'Unknown fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/capture/?title=Shared%20thought&text=Remember%20this&url=https%3A%2F%2Fexample.test%2Fsource');
  await expect(page.getByRole('textbox', { name: 'Capture title', exact: true })).toHaveValue('Shared thought');
  await expect(page.getByRole('textbox', { name: 'Captured text', exact: true })).toHaveValue('Remember this\n\nhttps://example.test/source');
  await expect(page).toHaveURL(origin + '/capture/');
  expect(attempts).toBe(0);
  await expect(page.getByRole('link', { name: 'Sign in in a new tab' })).toHaveAttribute('target', '_blank');
  signedIn = true;
  await page.getByRole('button', { name: 'Check sign-in', exact: true }).click();
  await expect(page.getByRole('main').getByText('Capture owner', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save to Inbox', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporary capture failure');
  await expect(page.getByRole('textbox', { name: 'Captured text', exact: true })).toHaveValue('Remember this\n\nhttps://example.test/source');
  fail = false;
  await page.getByRole('button', { name: 'Save to Inbox', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved privately to Inbox');
  expect(payloads[0].captureId).toBe(payloads[1].captureId);
  expect(payloads[1].text).toBe('Remember this\n\nhttps://example.test/source');
  await expect(page.getByRole('button', { name: 'Save to Inbox', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'New capture', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Captured text', exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
  console.log('Shared-text preview, unauthenticated capture, explicit save, failed-save retention, retry identity and mobile layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

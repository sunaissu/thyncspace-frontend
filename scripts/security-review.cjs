const { chromium, expect } = require('@playwright/test');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } });
  const user = { _id: '64b000000000000000000001', username: 'Security owner' };
  let signedIn = false, confirmations = 0, resets = 0, verifyRequests = 0; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname;
   let body, status = 200;
   if (path.endsWith('/getUser')) { status = signedIn ? 200 : 401; body = signedIn ? { user } : { error: 'Not signed in' }; }
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/request-reset')) { resets++; expect(req.postDataJSON().email).toBe('person@example.test'); body = { message: 'If this address belongs to a local account, a recovery link will arrive.' }; }
   else if (path.endsWith('/account-action')) { confirmations++; expect(req.postDataJSON().token).toBe('a'.repeat(64)); body = { message: req.postDataJSON().purpose === 'reset' ? 'Password changed. Existing sessions are signed out.' : 'Email verified.' }; }
   else if (path.endsWith('/security')) body = { provider: 'local', verified: false, emailDeliveryAvailable: true };
   else if (path.endsWith('/request-verification')) { verifyRequests++; expect(req.headers()['x-account-id']).toBe(user._id); body = { message: 'A verification link will arrive at your account email.' }; }
   else if (path.endsWith('/change-password')) { expect(req.headers()['x-account-id']).toBe(user._id); status = 400; body = { error: 'Current password is incorrect' }; }
   else { status = 404; body = { error: 'Unexpected fixture route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/recover/');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('person@example.test');
  await page.getByRole('button', { name: 'Send recovery link' }).click();
  await expect(page.getByRole('status')).toContainText('If this address'); expect(resets).toBe(1);
  await page.goto(origin + '/account-action/#purpose=reset&token=' + 'a'.repeat(64));
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(''); expect(confirmations).toBe(0);
  await page.getByLabel('New password', { exact: true }).fill('A new password 123!');
  await page.getByLabel('Repeat new password').fill('Does not match 456!');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('do not match'); expect(confirmations).toBe(0);
  await page.getByLabel('Repeat new password').fill('A new password 123!');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByRole('status')).toContainText('Password changed'); expect(confirmations).toBe(1);
  await page.goto(origin + '/account-action/#purpose=verify&token=' + 'a'.repeat(64));
  await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible(); expect(confirmations).toBe(1);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email verified');
  signedIn = true; await page.goto(origin + '/security/');
  await page.getByRole('button', { name: 'Send verification link' }).click();
  await expect(page.getByRole('status')).toContainText('verification link'); expect(verifyRequests).toBe(1);
  await page.getByLabel('Current password', { exact: true }).fill('Incorrect password!');
  await page.getByLabel('New password', { exact: true }).fill('A new password 123!');
  await page.getByLabel('Repeat new password').fill('A new password 123!');
  await page.getByRole('button', { name: 'Change password and sign out' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Current password is incorrect');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log('Recovery request, fragment removal, explicit token confirmation, password matching, security identity and mobile layout passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

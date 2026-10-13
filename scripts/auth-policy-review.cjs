const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }); let policy = { registrationEnabled: false, turnstileSiteKey: '' }, policyFails = false, submissions = 0, scripts = 0, gated = false; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://challenges.cloudflare.com/**', async route => { scripts++; await route.fulfill({ contentType: 'application/javascript', body: 'window.turnstile={render(node,options){const button=document.createElement("button");button.type="button";button.textContent="Complete test challenge";button.onclick=()=>options.callback("fixture-token");node.append(button);window.challengeOptions=options;return "fixture-widget";},remove(){document.querySelectorAll(".auth-challenge button").forEach(node=>node.remove())}};' }); });
  await page.route('**/api/**', async route => { const path = new URL(route.request().url()).pathname; let status = 200, body;
   if (path.endsWith('/policy')) { status = policyFails ? 503 : 200; body = policyFails ? { error: 'Unavailable' } : policy; }
   else if (path.endsWith('/getUser')) { status = gated ? 200 : 401; body = gated ? { user: { _id: '64b000000000000000000001', username: 'Unverified', workspaceAccess: false } } : { error: 'Not signed in' }; }
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (['/login', '/register', '/request-reset'].some(suffix => path.endsWith(suffix))) { submissions++; expect(route.request().postDataJSON().botToken).toBe('fixture-token'); expect(route.request().headers()['x-csrf-token']).toBe('fixture'); status = 400; body = { error: 'Review test rejected credentials' }; }
   else { status = 404; body = { error: 'Unexpected route' }; }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
  await page.goto(origin + '/register/'); await expect(page.getByText('New registrations are temporarily closed.', { exact: false })).toBeVisible(); await expect(page.locator('#register-submit')).toBeDisabled(); await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled(); expect(scripts).toBe(0);
  policy = { registrationEnabled: true, turnstileSiteKey: 'fixture-site' };
  for (const route of ['login', 'register', 'recover']) {
   await page.goto(origin + '/' + route + '/');
   await page.getByLabel('Email', { exact: true }).fill('person@example.test');
   if (route !== 'recover') await page.getByLabel('Password', { exact: true }).fill('fixture-password-12');
   if (route === 'register') { await page.getByLabel('Username', { exact: true }).fill('Test person'); await page.getByLabel('Confirm Password', { exact: true }).fill('fixture-password-12'); }
   const submit = page.locator('button[type="submit"]'); await expect(submit).toBeDisabled();
   await page.getByRole('button', { name: 'Complete test challenge' }).click(); await expect(submit).toBeEnabled();
   expect(await page.evaluate(() => window.challengeOptions.action)).toBe(route); await submit.click(); await expect(page.getByText('Review test rejected credentials', { exact: true })).toBeVisible(); await expect(submit).toBeDisabled();
   for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: 'test/artifacts/auth-' + route + '-' + width + '.png' }); }
  }
  expect(submissions).toBe(3); policyFails = true; await page.goto(origin + '/login/'); await expect(page.getByRole('button', { name: 'Retry sign-in options' })).toBeVisible(); await expect(page.locator('#login-submit')).toBeDisabled(); policyFails = false; await page.getByRole('button', { name: 'Retry sign-in options' }).click(); await expect(page.getByRole('button', { name: 'Complete test challenge' })).toBeVisible(); gated = true; await page.goto(origin + "/notes/"); await expect(page.getByRole("heading", { name: "Verify your email to open the workspace" })).toBeVisible(); await expect(page.getByRole("link", { name: "Account security", exact: true })).toBeVisible(); await expect(page.getByRole("link", { name: "Account privacy", exact: true })).toBeVisible(); expect(errors).toEqual([]);
  console.log('Registration shutdown, auth policy failure/retry, scoped challenge tokens, consumed-token reset and 320/390/1440px auth layouts passed. Cloudflare widget mocked.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [], user = { _id: '64b000000000000000000001', username: 'Companion owner' }, now = new Date().toISOString(), token = 'thy_obs_' + 'a'.repeat(43);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const document = { _id: '64b000000000000000000002', owner: user._id, title: 'Private document', type: 'document', content: 'Private writing', sharedWith: [], favoritedBy: [], contentRevision: 0, createdAt: now, updatedAt: now };
  const notes = [document, { ...document, _id: '64b000000000000000000003', title: 'Shared document', sharedWith: [{ userId: '64b000000000000000000004', permission: 'editor' }] }, { ...document, _id: '64b000000000000000000005', title: 'Whiteboard', type: 'whiteboard', content: '' }];
  let connections = [], creations = 0, revokes = 0;
  page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname; let body, status = 200;
   if (path.endsWith('/getUser')) body = { user };
   else if (path.endsWith('/csrf-token')) body = { token: 'fixture' };
   else if (path.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
   else if (path.endsWith('/reminders')) body = { revision: 0, entries: [] };
   else if (path.endsWith('/embeds')) body = { revision: 0, canEdit: true, entries: [] };
   else if (path.endsWith('/shared')) body = [];
   else if (path.endsWith('/notes')) body = notes;
   else if (path.includes('/companion-connections')) {
    expect(req.headers()['x-account-id']).toBe(user._id);
    if (req.method() === 'GET') body = connections;
    else if (req.method() === 'POST') {
     const input = req.postDataJSON(); expect(input.consent).toBe(true); expect(input.noteIds).toEqual([document._id]); expect(input.attachments).toBe(true); expect(input.clientId).toMatch(/^[a-f0-9-]{36}$/); expect(req.headers()['x-csrf-token']).toBe('fixture'); creations++;
     const connection = { id: '64b000000000000000000010', name: input.name, noteIds: input.noteIds, attachments: input.attachments, lastUsedAt: null, createdAt: now, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() }; connections.push(connection); body = { ...connection, token };
    } else { const input = req.postDataJSON(); expect(input.confirmation).toBe(connections[0].id); expect(path.endsWith('/' + connections[0].id)).toBe(true); revokes++; connections = []; await route.fulfill({ status: 204 }); return; }
   } else { const note = notes.find(note => path.endsWith('/' + note._id)); if (note) body = note; else { status = 404; body = { error: 'Unexpected fixture route' }; } }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Obsidian companion'); await page.getByRole('button', { name: 'Obsidian companion Action' }).click();
  const dialog = page.getByRole('dialog', { name: 'Obsidian companion', exact: true }), create = dialog.getByRole('button', { name: 'Create companion token', exact: true }), consent = dialog.getByRole('checkbox', { name: 'Allow this connection to read and update the selected private documents.', exact: true });
  await expect(dialog.getByText('No companion connections.', { exact: true })).toBeVisible(); await expect(create).toBeDisabled(); expect(creations).toBe(0);
  await expect(dialog.getByRole('checkbox', { name: 'Shared document', exact: true })).toHaveCount(0); await expect(dialog.getByRole('checkbox', { name: 'Whiteboard', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Connection name', { exact: true }).fill('Study vault'); await dialog.getByRole('checkbox', { name: 'Private document', exact: true }).check(); await consent.check(); await dialog.getByRole('checkbox', { name: 'Include downloads of files linked to these documents.', exact: true }).check(); await expect(consent).not.toBeChecked(); await expect(create).toBeDisabled();
  await consent.check(); await create.click(); await expect(dialog.getByLabel('Companion token', { exact: true })).toHaveValue(token); await expect(consent).not.toBeChecked(); expect(creations).toBe(1); await dialog.getByRole('button', { name: 'Copy token', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Token copied', exact: true })).toBeVisible(); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);
  expect(await page.evaluate(value => Object.keys(localStorage).some(key => localStorage.getItem(key)?.includes(value)), token)).toBe(false);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/companion-${width}.png` }); }
  await dialog.getByRole('button', { name: 'Hide token', exact: true }).click(); await expect(dialog.getByLabel('Companion token', { exact: true })).toHaveCount(0);
  await dialog.getByText('Install the companion', { exact: true }).click();
  for (const name of ['main.js', 'manifest.json']) { const download = page.waitForEvent('download'); await dialog.getByRole('link', { name, exact: true }).click(); const file = await download; expect(file.suggestedFilename()).toBe(name); const data = fs.readFileSync(await file.path(), 'utf8'); if (name === 'manifest.json') { expect(JSON.parse(data).isDesktopOnly).toBe(true); expect(JSON.parse(data).id).toBe('thyncspace-companion'); } else expect(data).toContain('class ThyncSpaceCompanion'); }
  await dialog.getByRole('button', { name: 'Revoke connection', exact: true }).click(); await expect(dialog.getByText('No companion connections.', { exact: true })).toBeVisible(); expect(revokes).toBe(1); await dialog.getByRole('button', { name: 'Close companion', exact: true }).click(); expect(errors).toEqual([]);
  console.log('Companion private scope, per-connection consent, account/CSRF guards, one-time token display, clipboard, downloadable plugin, revocation and responsive layouts passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

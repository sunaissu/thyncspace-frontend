const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3011';
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } }), errors = [];
  const user = { _id: '64b000000000000000000001', username: 'Passage owner' }, now = new Date().toISOString(), passage = 'Mass m = 5 kg.';
  const source = { _id: '64b000000000000000000002', owner: user._id, title: 'Private science note', type: 'document', content: 'UNSELECTED PREFIX\n' + passage + '\nUNSELECTED SUFFIX', sharedWith: [], favoritedBy: [], contentRevision: 3, createdAt: now, updatedAt: now };
  let sends = 0, captures = [], conflict = false, enabled = true; const notes = [source];
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
   else if (path.endsWith('/ai-settings')) body = { enabled, provider: 'OpenAI', limit: 8000 };
   else if (path.endsWith('/ai')) {
    sends++; const input = req.postDataJSON(); expect(input.consent).toBe(true); expect(input.excerpt).toBe(passage); expect(input.expectedRevision).toBe(3); expect(req.postData()).not.toContain('UNSELECTED');
    if (conflict) { status = 409; body = { error: 'The source changed. Reload it and review the passage before sending' }; conflict = false; }
    else body = { action: input.action, source: { noteId: source._id, title: source.title, revision: 3, start: input.start, end: input.end, excerpt: passage, changed: true }, result: { text: '<img src=x onerror=alert(1)> Review this ![image](https://example.test/tracker)', citations: [passage], variables: input.action === 'variables' ? [{ name: 'm', value: '5', unit: 'kg', quote: passage }] : [], warnings: ['Check units before use.'] } };
   } else if (path.endsWith('/capture')) { const input = req.postDataJSON(); captures.push(input); body = { ...source, _id: '64b000000000000000000003', title: input.title, content: input.text, contentRevision: 0 }; notes.push(body); }
   else { const note = notes.find(note => path.endsWith('/' + note._id)); if (note) body = note; else { status = 404; body = { error: 'Unexpected fixture route' }; } }
   await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible({ timeout: 60000 });
  const open = async () => { await page.getByRole('button', { name: 'Commands', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a note or command' }).fill('Passage AI'); await page.getByRole('button', { name: 'Passage AI actions Action' }).click(); };
  await open(); const dialog = page.getByRole('dialog', { name: 'Passage AI actions', exact: true }), input = dialog.getByRole('textbox', { name: 'Saved source: select a passage', exact: true }), send = dialog.getByRole('button', { name: 'Send reviewed passage', exact: true }), consent = dialog.getByRole('checkbox');
  await expect(input).toHaveValue(source.content); await expect(send).toBeDisabled(); expect(sends).toBe(0);
  const selectPassage = async () => { await input.click(); await input.evaluate(node => { const start = node.value.indexOf("Mass m"); node.setSelectionRange(start, start + 1); }); for (let i = 1; i < passage.length; i++) await input.press("Shift+ArrowRight"); };
  await selectPassage(); await expect(dialog.getByRole('region', { name: 'Send preview' })).toContainText(passage); await expect(send).toBeDisabled(); expect(sends).toBe(0);
  await consent.check(); await dialog.getByLabel('AI action', { exact: true }).selectOption('variables'); await expect(consent).not.toBeChecked(); await expect(send).toBeDisabled();
  conflict = true; await consent.check(); await send.click(); await expect(dialog.getByRole('alert')).toContainText('source changed'); await expect(consent).not.toBeChecked(); await expect(dialog.getByRole('region', { name: 'AI result' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Reload saved source', exact: true }).click(); await expect(input).toHaveValue(source.content); await selectPassage(); await consent.check(); await send.click();
  const result = dialog.getByRole('region', { name: 'AI result', exact: true }); await expect(result).toContainText('m: 5 kg'); await expect(result).toContainText('source changed while this result was generated'); expect(await result.locator('img').count()).toBe(0); expect(sends).toBe(2); expect(captures).toHaveLength(0);
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 950 }); expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); fs.mkdirSync('test/artifacts', { recursive: true }); await page.screenshot({ path: `test/artifacts/ai-${width}.png` }); }
  const downloadPromise = page.waitForEvent('download'); await result.getByRole('button', { name: 'Download result', exact: true }).click(); expect((await downloadPromise).suggestedFilename()).toBe('thyncspace-passage-result.json');
  await result.getByRole('button', { name: 'Save a private copy', exact: true }).click(); await expect(result.getByRole('button', { name: 'Private copy saved', exact: true })).toBeDisabled(); expect(captures).toHaveLength(1); expect(captures[0].text).toContain('[[' + source._id + ']]'); expect(captures[0].text).toContain('    <img'); expect(captures[0].text).not.toContain('UNSELECTED'); expect(notes[1].sharedWith).toEqual([]);
  await dialog.getByRole('button', { name: 'Close AI actions', exact: true }).click(); await page.setViewportSize({ width: 1440, height: 950 }); enabled = false; await open(); await expect(dialog.getByRole('status')).toContainText('not enabled'); await expect(input).toHaveValue(source.content); await selectPassage(); await expect(consent).toBeDisabled(); await expect(send).toBeDisabled(); expect(sends).toBe(2); expect(source.content).toContain('UNSELECTED PREFIX'); expect(errors).toEqual([]);
  console.log('AI send preview, per-request consent, exact passage scope, conflict handling, literal output, source-linked private copy, disabled deployment and mobile layouts passed (mock provider).');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

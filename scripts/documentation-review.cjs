const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createTextElement } = require('@sunaissu/noteboard');
const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3010';
const output = path.resolve('../../tmp/documentation-review');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    const user = { _id: '64b000000000000000000002', username: 'Documentation review' };
    const sections = [
      { id: 'overview', type: 'text', title: 'Overview', content: '## A clearer way to explain an idea\n\nBring the explanation and the diagram together.\n\n- Write the context\n- Sketch the system\n- Share the result' },
      { id: 'diagram', type: 'board', title: 'System map', caption: 'The first version connects writing, drawing, and export.', height: 440, elements: [createTextElement({ id: 'diagram-label', x: 40, y: 30, text: 'Write → Draw → Share', fontSize: 28 })], viewport: { panX: 0, panY: 0, zoom: 1 } },
      { id: 'next', type: 'text', title: 'Next steps', content: '- [ ] Review the design\n- [ ] Publish the documentation' },
    ];
    let note = { _id: '64b000000000000000000001', owner: user._id, title: 'A space for ideas', type: 'documentation', content: JSON.stringify({ format: 'thyncspace-documentation', version: 1, sections }), contentRevision: 0, sharedWith: [], favoritedBy: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await context.route('**/api/**', async route => {
      const request = route.request(), endpoint = new URL(request.url()).pathname;
      let body;
      if (endpoint.endsWith('/getUser')) body = { user };
      else if (endpoint.endsWith('/workspace')) body = { revision: 0, pinned: [], recent: [], searches: [] };
      else if (endpoint.endsWith('/csrf-token')) body = { token: 'fixture-token' };
      else if (endpoint.endsWith('/private')) { const input = request.postDataJSON(); writes.push(input); note = { ...note, content: input.text, contentRevision: note.contentRevision + 1, updatedAt: new Date().toISOString() }; body = note; }
      else if (endpoint.endsWith('/notes') && request.method() === 'POST') { const input = request.postDataJSON(); note = { ...note, _id: '64b000000000000000000005', title: input.title, type: input.type, content: input.text, contentRevision: 0 }; body = note; }
      else if (endpoint.endsWith('/shared') || endpoint.endsWith('/reminders') || endpoint.endsWith('/history')) body = [];
      else if (endpoint.endsWith('/notes')) body = [note];
      else body = note;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(origin + '/notes/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const editor = page.locator('.documentation-editor');
    await editor.waitFor({ timeout: 60000 });
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('Overview');
    await page.screenshot({ path: path.join(output, 'desktop-write.png') });
    await page.getByRole('textbox', { name: 'Section 1 title', exact: true }).fill('Purpose');
    const text = page.getByRole('textbox', { name: 'Visual document editor' }).first();
    await text.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' Documentation saves together.');
    await expect.poll(() => note.content, { timeout: 12000 }).toContain('Documentation saves together.');
    await page.getByRole('textbox', { name: 'Diagram caption: System map' }).fill('A caption saved with the diagram.');
    await page.getByRole('button', { name: 'Expand diagram: System map' }).click();
    await expect(page.getByRole('dialog', { name: 'System map' })).toBeVisible();
    await page.getByRole('button', { name: 'Close expanded diagram' }).click();
    const first = page.locator('.documentation-section').first();
    await first.getByRole('button', { name: 'Duplicate section', exact: true }).click();
    await expect(page.locator('.documentation-section')).toHaveCount(4);
    await page.locator('.documentation-section').nth(1).getByRole('button', { name: 'Remove section', exact: true }).click();
    await expect(page.locator('.documentation-section')).toHaveCount(3);
    await page.getByRole('button', { name: 'Undo section change' }).click();
    await expect(page.locator('.documentation-section')).toHaveCount(4);
    await page.getByRole('button', { name: 'Redo section change' }).click();
    await expect(page.locator('.documentation-section')).toHaveCount(3);
    await page.locator('.documentation-section').nth(1).getByRole('button', { name: 'Move section up' }).click();
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('System map');
    await expect.poll(() => JSON.parse(note.content).sections[0].title, { timeout: 12000 }).toBe('System map');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('System map');
    await expect(page.getByRole('textbox', { name: 'Diagram caption: System map' })).toHaveValue('A caption saved with the diagram.');
    await page.getByRole('button', { name: 'Read', exact: true }).click();
    await expect(page.locator('.documentation-text-preview')).toContainText(['Documentation saves together.', 'Review the design']);
    await page.screenshot({ path: path.join(output, 'desktop-read.png') });
    for (const [name, extension] of [['Word', 'docx'], ['PDF', 'pdf']]) {
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name, exact: true }).click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toMatch(new RegExp('\\.' + extension + '$'));
      await download.saveAs(path.join(output, 'documentation.' + extension));
      expect(fs.statSync(path.join(output, 'documentation.' + extension)).size).toBeGreaterThan(1000);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'phone-read.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Write', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'phone-write.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: path.join(output, 'phone-landscape.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('.documentation-page-scroll').evaluate(element => element.clientHeight)).toBeGreaterThan(180);
    await page.setViewportSize({ width: 1512, height: 1000 });
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await page.getByRole('button', { name: /^Documentation Explain/ }).click();
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('Overview');
    expect(note.type).toBe('documentation');
    expect(JSON.parse(note.content).sections.map(section => section.type)).toEqual(['text', 'board', 'text']);
    const healthy = structuredClone(note), original = '{"format":"thyncspace-documentation","version":999,"original":"keep these bytes"}';
    note = { ...note, content: original };
    const writesBeforeInvalid = writes.length;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('This documentation could not be opened. Its original contents have been preserved.')).toBeVisible();
    const originalDownloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download original', exact: true }).click();
    const originalDownload = await originalDownloadEvent;
    expect(fs.readFileSync(await originalDownload.path(), 'utf8')).toBe(original);
    expect(writes.length).toBe(writesBeforeInvalid);
    note = healthy;
    const pending = JSON.parse(note.content); pending.sections[0].title = 'Queued copy';
    await page.evaluate(async ({ note, user, pending }) => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('thyncspace-offline-library', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('notes', { keyPath: ['account', 'noteId'] }).createIndex('account', 'account');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('notes', 'readwrite');
        transaction.objectStore('notes').put({ account: user._id, username: user.username, noteId: note._id, title: note.title, type: note.type, baseContent: note.content, pending, baseRevision: note.contentRevision, revision: 1, editable: true, cachedAt: new Date().toISOString(), changedAt: new Date().toISOString() });
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, { note, user, pending: JSON.stringify(pending) });
    await page.goto(origin + '/offline-library/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Untitled Documentation Queued edits/ }).click();
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('Queued copy');
    await page.getByRole('button', { name: 'Compare with server', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Use server version', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Section 1 title', exact: true })).toHaveValue('Overview');
    await expect(page.getByRole('button', { name: 'Queue changes on this device', exact: true })).toBeDisabled();
    const offlineDownloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download current edit', exact: true }).click();
    const offlineDownload = await offlineDownloadEvent;
    expect(JSON.parse(fs.readFileSync(await offlineDownload.path(), 'utf8')).sections[0].title).toBe('Overview');
    expect(errors).toEqual([]);
    expect(writes.length).toBeGreaterThan(0);
    console.log('Documentation creation, authoring, save/reload, section undo/reorder, expanded board, reading view, Word/PDF downloads, phone layouts, invalid-original recovery and offline server replacement passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const { chromium, expect } = require('@playwright/test');
const { createTextElement } = require('@sunaissu/noteboard');
const fs = require('node:fs');
const path = require('node:path');

const origin = process.env.REVIEW_URL || 'http://127.0.0.1:3010';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, colorScheme: 'light' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const user = { _id: '64b000000000000000000002', username: 'Appearance review', email: 'appearance@example.test' };
    const workspace = { revision: 0, pinned: [], recent: [], searches: [] };
    let note = {
      _id: '64b000000000000000000001', owner: user._id, title: 'Appearance document', type: 'document',
      content: '# Appearance\n\n' + 'A scrollable document.\n\n'.repeat(100), contentRevision: 0,
      sharedWith: [], favoritedBy: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await page.route('**/api/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let body = note;
      if (pathname.endsWith('/getUser')) body = { user };
      else if (pathname.endsWith('/csrf-token')) body = { token: 'fixture-token' };
      else if (pathname.endsWith('/workspace')) body = workspace;
      else if (pathname.endsWith('/sessions') || pathname.endsWith('/shared') || pathname.endsWith('/reminders')) body = [];
      else if (pathname.endsWith('/storage')) body = { totals: { notes: 1, totalBytes: 30, contentBytes: 30, historyBytes: 0, collaborationBytes: 0, trashBytes: 0 }, largest: [], noteLimitBytes: 1048576 };
      else if (pathname.endsWith('/notes')) body = [note];
      else if (pathname.endsWith('/private')) body = note = { ...note, content: request.postDataJSON().text, contentRevision: note.contentRevision + 1 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    await page.goto(origin + '/settings/');
    await page.getByRole('combobox', { name: /^Color scheme/ }).selectOption('plum');
    await page.getByRole('combobox', { name: /^Scrollbar appearance/ }).selectOption('custom');
    await page.getByLabel('Thumb color', { exact: true }).fill('#123456');
    await page.getByLabel('Transparent track', { exact: true }).uncheck();
    await page.getByLabel('Track color', { exact: true }).fill('#abcdef');
    await page.getByLabel('Thin scrollbars', { exact: true }).check();
    await page.reload();
    await expect(page.getByRole('combobox', { name: /^Color scheme/ })).toHaveValue('plum');
    await expect(page.getByLabel('Thumb color', { exact: true })).toHaveValue('#123456');
    await expect(page.getByLabel('Thin scrollbars', { exact: true })).toBeChecked();
    const artifacts = path.join('test', 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, 'package-appearance-settings.png'), fullPage: true });

    const checkPackage = async (selector, prefix) => {
      const root = page.locator(selector).first();
      await expect(root).toHaveCSS('scrollbar-color', 'rgb(18, 52, 86) rgb(171, 205, 239)');
      await expect(root).toHaveCSS('scrollbar-width', 'thin');
      await expect.poll(() => root.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property).trim(), prefix)).toBe('#9333ea');
    };
    await page.goto(origin + '/notes/');
    await expect(page.getByRole('textbox', { name: 'Visual document editor' })).toBeVisible();
    await checkPackage('.sunaissu-document-editor', '--document-accent');
    await page.getByRole('button', { name: 'Calculator', exact: true }).click();
    await checkPackage('.sunaissu-calculator-panel', '--calculator-accent');
    await page.screenshot({ path: path.join(artifacts, 'package-appearance-document.png') });

    note = { ...note, title: 'Appearance board', type: 'whiteboard', content: JSON.stringify({ elements: [createTextElement({ text: 'Board appearance' })], viewport: { panX: 0, panY: 0, zoom: 1 } }) };
    await page.reload();
    const board = page.getByLabel('Noteboard canvas', { exact: true });
    await expect(board).toBeVisible();
    await expect(board).toHaveCSS('scrollbar-color', 'rgb(18, 52, 86) rgb(171, 205, 239)');
    await expect(board.locator('[data-noteboard-toolbar] button[aria-pressed=true]').first()).toHaveCSS('color', 'rgb(147, 51, 234)');
    await expect(page.getByText('Recover previous board', { exact: false })).toHaveCount(0);

    await page.goto(origin + '/settings/');
    await page.getByRole('combobox', { name: /^Scrollbar appearance/ }).selectOption('hidden');
    await page.goto(origin + '/notes/');
    await expect(board).toHaveCSS('scrollbar-width', 'none');
    note = { ...note, type: 'document', content: '# Hidden scrollbars\n\n' + 'Content remains scrollable.\n\n'.repeat(100) };
    await page.reload();
    await page.getByRole('button', { name: 'Markdown', exact: true }).click();
    const source = page.getByRole('textbox', { name: 'Markdown source' });
    await expect(source).toHaveCSS('scrollbar-width', 'none');
    await source.focus();
    await source.evaluate(element => { element.scrollTop = 0; element.setSelectionRange(0, 0); });
    await page.keyboard.press('PageDown');
    await expect.poll(() => source.evaluate(element => element.scrollTop)).toBeGreaterThan(0);

    await page.goto(origin + '/settings/');
    await page.getByRole('combobox', { name: /^Scrollbar appearance/ }).selectOption('native');
    await page.getByLabel('Thin scrollbars', { exact: true }).uncheck();
    await page.getByRole('combobox', { name: /^Color scheme/ }).selectOption('default');
    for (const width of [390, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(artifacts, `package-appearance-settings-${width}.png`) });
    }
    await page.goto(origin + '/notes/');
    await expect(page.locator('.sunaissu-document-editor')).toHaveCSS('scrollbar-color', 'auto');
    await expect(page.locator('.sunaissu-document-editor')).toHaveCSS('scrollbar-width', 'auto');
    expect(errors).toEqual([]);
    console.log('App appearance preferences persist and reach document, calculator, and board; hidden scrolling, native reset, and mobile layouts passed.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

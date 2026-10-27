const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { buildSync } = require('esbuild');

test('backlinks expand in batches and drop inaccessible notes without stale graph entries', async () => {
  const bundle = buildSync({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import NoteConnections from './src/components/noteConnections';
        const target = { _id:'target', title:'Target', type:'document', content:'' };
        const initial = [target, ...Array.from({length:250}, (_, i) => ({ _id:'source-'+i, title:'Source '+i, type:'document', content:'[[target]]' }))];
        function App() {
          const [notes, setNotes] = useState(initial);
          return <><button onClick={() => setNotes(notes.slice(0, 11))}>Remove inaccessible notes</button>
            <NoteConnections notes={notes} note={target} onOpen={id => document.body.dataset.opened = id} onClose={() => {}} /></>;
        }
        createRoot(document.getElementById('root')).render(<App />);
      `,
      loader: 'jsx',
      resolveDir: path.resolve(__dirname, '..'),
    },
    bundle: true,
    format: 'iife',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
  }).outputFiles[0].text;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle });
    const backlinks = page.getByRole('heading', { name: 'Backlinks', exact: true }).locator('..');
    await expect(backlinks.locator('li')).toHaveCount(100);
    await backlinks.getByRole('button', { name: 'Show 100 more backlinks (250 total)', exact: true }).click();
    await expect(backlinks.locator('li')).toHaveCount(200);
    await backlinks.getByRole('button', { name: 'Show 50 more backlinks (250 total)', exact: true }).click();
    await expect(backlinks.locator('li')).toHaveCount(250);
    await backlinks.getByRole('button', { name: 'Source 249', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-opened', 'source-249');
    await page.getByRole('button', { name: 'Remove inaccessible notes', exact: true }).click();
    await expect(backlinks.locator('li')).toHaveCount(10);
    await expect(page.getByRole('img')).toHaveAttribute('aria-label', 'Graph of Target and 10 connected notes');
    await expect(backlinks.getByRole('button', { name: /Show .* more backlinks/ })).toHaveCount(0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const JSZip = require('jszip');

const root = path.resolve(__dirname, '..');
const output = process.env.QA_OUTPUT || path.join(root, 'test', 'artifacts', 'documentation-export');

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const bundle = await build({
    stdin: { contents: 'import { exportDocumentation } from "./src/util/documentationExport"; import { renderAsync } from "docx-preview"; import { createRectangleElement, createArrowElement } from "@sunaissu/noteboard"; window.exportDocumentation=exportDocumentation; window.renderWord=renderAsync; window.rectangle=createRectangleElement; window.arrow=createArrowElement;', resolveDir: root },
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'warning',
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) });
  const requested = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    await page.route('**/*', route => { requested.push(route.request().url()); return route.abort(); });
    await page.setContent('<!doctype html><html><body><div id="preview"></div></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 70;
      const context = canvas.getContext('2d'); context.fillStyle = '#dbeafe'; context.fillRect(0, 0, 160, 70); context.fillStyle = '#1e40af'; context.font = 'bold 20px Arial'; context.fillText('Local image', 18, 42);
      const table = '| Decision | Owner | Status |\n| --- | --- | --- |\n' + Array.from({ length: 38 }, (_, i) => `| Decision ${i + 1} with a clear description | Team ${i % 3 + 1} | ${i % 2 ? 'In progress' : 'Complete'} |`).join('\n');
      const content = { format: 'thyncspace-documentation', version: 1, sections: [
        { id: 'overview', type: 'text', title: 'Project overview', content: '# Release plan\n\nSnapshot original content with **bold**, *italic*, ~~deleted~~ and `inline code`.\n\n3. Confirm the plan\n4. Test the export\n   - Review every page\n   - Keep diagrams with their captions\n\n> A shared record of the project decisions.\n\n[Reference](https://example.test/reference)\n\n![Private external image](https://private.example.test/secret.png)\n\n![Embedded sample](' + canvas.toDataURL() + ')\n\nUnicode remains legible: café Ελληνικά 日本語 😀.\n\n' + table },
        { id: 'diagram', type: 'board', title: 'Delivery workflow', caption: 'Figure 1. A board snapshot exported with the surrounding documentation.', height: 400, viewport: { panX: 0, panY: 0, zoom: 1 }, elements: [
          window.rectangle({ id: 'box1', x: 0, y: 0, width: 220, height: 110, backgroundColor: '#dbeafe', strokeColor: '#2563eb', text: 'Plan the release', fontSize: 22, fontFamily: 'Arial' }),
          window.rectangle({ id: 'box2', x: 310, y: 0, width: 220, height: 110, backgroundColor: '#dcfce7', strokeColor: '#16a34a', text: 'Review together', fontSize: 22, fontFamily: 'Arial' }),
          window.arrow({ id: 'arrow', x: 230, y: 55, width: 70, height: 0, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], strokeColor: '#475569' }),
        ] },
        { id: 'followup', type: 'text', title: 'Next steps', content: '## Review checklist\n\n' + Array.from({ length: 20 }, (_, i) => `${i + 1}. Confirm this item is visible in the final document and that longer sentences wrap within the page margins.`).join('\n') + '\n\nFinal export marker.' },
      ] };
      const wordPromise = window.exportDocumentation(content, 'Project documentation', 'docx');
      content.sections[0].content = 'MUTATED AFTER EXPORT START';
      const word = await wordPromise;
      content.sections[0].content = '# Release plan\n\nSnapshot original content with **bold**, *italic*, ~~deleted~~ and `inline code`.\n\n3. Confirm the plan\n4. Test the export\n   - Review every page\n\n![Private external image](https://private.example.test/secret.png)\n\n![Embedded sample](' + canvas.toDataURL() + ')\n\nUnicode remains legible: café Ελληνικά 日本語 😀.\n\n' + table;
      const pdf = await window.exportDocumentation(content, 'Project documentation', 'pdf');
      await window.renderWord(word, document.getElementById('preview'), undefined, { ignoreHeight: true, useBase64URL: true });
      const encode = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
      let rejected = false;
      const broken = structuredClone(content); broken.sections[1].elements = [{ id: 'remote', type: 'image', x: 0, y: 0, width: 100, height: 100, dataUrl: 'https://private.example.test/board.png' }];
      try { await window.exportDocumentation(broken, 'Broken image', 'pdf'); } catch (error) { rejected = /not been embedded/.test(error.message); }
      return { word: await encode(word), pdf: await encode(pdf), wordType: word.type, pdfType: pdf.type, rejected, previewText: document.getElementById('preview').innerText, previewImages: document.querySelectorAll('#preview img').length };
    });
    assert.equal(result.wordType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.equal(result.pdfType, 'application/pdf');
    assert.equal(result.rejected, true, 'unresolved board images should reject visibly');
    assert.deepEqual(requested, [], 'exports must not fetch remote images');
    const wordBytes = Buffer.from(result.word, 'base64'), pdfBytes = Buffer.from(result.pdf, 'base64');
    fs.writeFileSync(path.join(output, 'sample.docx'), wordBytes);
    fs.writeFileSync(path.join(output, 'sample.pdf'), pdfBytes);
    const zip = await JSZip.loadAsync(wordBytes);
    const xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /Snapshot original content/); assert.doesNotMatch(xml, /MUTATED AFTER EXPORT START/);
    for (const expected of ['<w:tbl>', '<w:numPr>', '<w:b', '<w:i', 'Delivery workflow', 'Final export marker', 'External image not included']) assert.ok(xml.includes(expected), expected);
    assert.ok(Object.keys(zip.files).filter(name => /^word\/media\/.*\.png$/.test(name)).length >= 2, 'embedded image and board are native DOCX media');
    const footer = await zip.file('word/footer1.xml').async('string');
    assert.match(footer, /PAGE/); assert.match(footer, /NUMPAGES/);
    assert.ok(result.previewImages >= 2);
    await page.screenshot({ path: path.join(output, 'word-preview.png'), fullPage: true });
    await page.screenshot({ path: path.join(output, 'word-preview-top.png') });
    await page.getByText('Delivery workflow', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'word-preview-board.png') });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes), standardFontDataUrl: path.join(root, 'node_modules/pdfjs-dist/standard_fonts').replace(/\\/g, '/') + '/' });
    const pdf = await loadingTask.promise;
    assert.ok(pdf.numPages >= 3, 'long documentation paginates');
    const { createCanvas } = require('@napi-rs/canvas');
    let text = '';
    for (let index = 1; index <= pdf.numPages; index++) {
      const pdfPage = await pdf.getPage(index);
      const textContent = await pdfPage.getTextContent();
      text += textContent.items.map(item => item.str || '').join(' ') + '\n';
      const viewport = pdfPage.getViewport({ scale: 1.4 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await pdfPage.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise;
      fs.writeFileSync(path.join(output, `pdf-page-${index}.png`), canvas.toBuffer('image/png'));
    }
    assert.match(text, /Decision 38/); assert.match(text, /Delivery workflow/); assert.match(text, /Final export marker/);
    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) assert.ok(text.includes(`Page ${pageIndex} of ${pdf.numPages}`));
    const report = { passed: true, pages: pdf.numPages, wordBytes: wordBytes.length, pdfBytes: pdfBytes.length, remoteRequests: requested.length, wordMedia: result.previewImages, checks: ['snapshot isolation', 'native DOCX text, list, table, formatting and page fields', 'embedded images and board snapshot', 'external image placeholder with no requests', 'unresolved board image rejects', 'PDF pagination and complete text'], wordPreviewNote: 'Browser DOCX preview verifies content and styling; Word controls final automatic pagination.' };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    await loadingTask.destroy();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/linkedSelection.ts');
const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
const requireOriginal = compiled.require.bind(compiled);
compiled.require = name => name === '../model/note' ? { sanitizeNoteboardElements: value => value, sanitizeNoteboardViewport: value => value } : requireOriginal(name);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { selectedContent, sourceExport } = compiled.exports;
const source = { noteId: '64b000000000000000000001', title: '</title><script>alert(1)</script>', type: 'document', revision: 3, content: 'one\n<script>alert(2)</script>\nthree', selection: { kind: 'lines', start: 2, end: 2, revision: 3 } };
test('static excerpts escape active content and retain only chosen lines plus source navigation', () => {
 const html = sourceExport(source, 'https://example.test');
 assert.equal(selectedContent(source), '<script>alert(2)</script>');
 assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('three'));
 assert.ok(html.includes('https://example.test/notes/?noteId=' + source.noteId)); assert.ok(html.includes("default-src 'none'"));
});
test('changed and restored selections stay blocked even when revision numbers later coincide', () => {
 assert.throws(() => selectedContent({ ...source, revision: 4 }), /source changed/);
 assert.throws(() => selectedContent({ ...source, selection: { ...source.selection, needsReview: true } }), /source changed/);
 const board = { ...source, type: 'whiteboard', content: JSON.stringify({ elements: [{ id: 'chosen', type: 'text', text: 'keep' }, { id: 'other', type: 'text', text: 'omit' }], viewport: {} }), selection: { kind: 'elements', ids: ['chosen'], revision: 3 } };
 assert.deepEqual(JSON.parse(selectedContent(board)).elements.map(item => item.id), ['chosen']);
 assert.throws(() => sourceExport(board, 'https://example.test', 'javascript:alert(1)'), /image/);
});

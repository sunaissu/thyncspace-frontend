const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const filename = path.resolve(__dirname, '../src/util/workspaceArchive.ts'), compiled = new Module(filename, module);
compiled.filename = filename; compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { parseWorkspaceArchive, serializeWorkspaceArchive, archiveBatch } = compiled.exports;
const hash = text => createHash('sha256').update(text).digest('hex');
const row = { kind: 'note', id: '64b000000000000000000002', data: { title: '科学 🧪', content: 'encoded', status: 'active' } };
const make = (rows = [row]) => JSON.stringify({ kind: 'manifest', format: 'thyncspace-workspace', version: 1 }) + '\n' + rows.map(value => JSON.stringify(value) + '\n').join('') + JSON.stringify({ kind: 'complete', records: rows.length, notes: rows.filter(row => row.kind === 'note').length, files: rows.filter(row => row.kind === 'attachment').length, digest: hash(rows.map(row => hash(JSON.stringify(row)) + '\n').join('')) }) + '\n';
test('archive parsing handles fragmented UTF-8 and verifies round-trip completion', async () => {
 const bytes = new TextEncoder().encode(make()); let index = 0;
 const stream = new ReadableStream({ pull(controller) { if (index === bytes.length) controller.close(); else controller.enqueue(bytes.slice(index, ++index)); } });
 const parsed = await parseWorkspaceArchive(stream); assert.equal(parsed.notes, 1); assert.equal(parsed.records[0].data.title, row.data.title);
 assert.equal((await parseWorkspaceArchive(serializeWorkspaceArchive(parsed).stream())).digest, parsed.digest);
});
test('truncated, altered, duplicate, out-of-order and unknown archives are rejected', async () => {
 for (const text of [make().split('\n').slice(0, 2).join('\n'), make().replace('科学', 'tampered'), make([row, row]), make() + JSON.stringify(row), make().replace('thyncspace-workspace', 'thyncspace-account'), make().replace('"kind":"note"', '"kind":"profile"')]) await assert.rejects(parseWorkspaceArchive(new Blob([text]).stream()));
 await assert.rejects(parseWorkspaceArchive(new Blob([new Uint8Array([255])]).stream()));
});
test('upload batches stay within request byte and count bounds', () => {
 assert.equal(archiveBatch(Array(30).fill(row), 0).length, 20);
 const large = { ...row, data: { content: 'x'.repeat(2 * 1024 * 1024) } }; assert.equal(archiveBatch([large, large, row], 0).length, 1);
});

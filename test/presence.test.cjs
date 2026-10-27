const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/presence.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { parseTextCaret, parsePresence } = compiled.exports;

test('a keyboard caret remains valid without a mouse pointer', () => {
  assert.equal(parsePresence(null), null);
  assert.deepEqual(parseTextCaret({ surface: 'visual', block: 3, offset: 12, user: 'forged' }), { surface: 'visual', block: 3, offset: 12 });
  assert.deepEqual(parseTextCaret({ surface: 'markdown', block: 0, offset: 123 }), { surface: 'markdown', block: 0, offset: 123 });
  assert.deepEqual(parseTextCaret({ surface: 'visual', block: 4, offset: 0, empty: true }), { surface: 'visual', block: 4, offset: 0, empty: true });
});

test('remote carets reject invalid or excessively large coordinates', () => {
  for (const input of [
    null, [],
    { surface: 'board', block: 0, offset: 0 },
    { surface: 'visual', block: -1, offset: 0 },
    { surface: 'visual', block: 100001, offset: 0 },
    { surface: 'visual', block: 0, offset: NaN },
    { surface: 'visual', block: 0, offset: Infinity },
    { surface: 'visual', block: 0, offset: 1.5 },
    { surface: 'visual', block: 0, offset: 1048577 },
    { surface: 'markdown', block: 1, offset: 0 },
    { surface: 'markdown', block: 0, offset: 0, empty: true },
    { surface: 'visual', block: 0, offset: 1, empty: true },
  ]) assert.equal(parseTextCaret(input), null, JSON.stringify(input));
});

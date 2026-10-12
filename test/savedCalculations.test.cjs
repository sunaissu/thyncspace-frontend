const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/savedCalculations.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { calculationMarkdown, readCalculations, recalculate } = compiled.exports;
const result = { kind: 'expression', expression: 'a*2', displayExpression: 'a*2', numericValue: 6, value: '6', context: { variables: { a: 3 }, angleUnit: 'deg' } };
test('portable calculations retain inputs and source range across Markdown and CRLF', () => {
  const block = calculationMarkdown(result);
  for (const content of ['Intro\n\n' + block + '\nTail', ('Intro\n\n' + block + '\nTail').replaceAll('\n','\r\n')]) {
    const [found] = readCalculations(content); assert.ok(found); assert.deepEqual(found.result.context, result.context);
    assert.equal(content.slice(found.start, found.end), found.source);
    assert.equal(recalculate(found.result, 'a*3', { a: 4 }).numericValue, 12);
  }
});
test('all calculation operations reuse the safe engine and settings', () => {
  assert.ok(Math.abs(recalculate({ ...result, kind: 'derivative', context: { point: '2' } }, 'x^2', {}).numericValue - 4) < 1e-5);
  assert.ok(Math.abs(recalculate({ ...result, kind: 'integral', context: { lowerBound: '0', upperBound: '2' } }, 'x', {}).numericValue - 2) < 1e-5);
  assert.ok(Math.abs(recalculate({ ...result, kind: 'root', context: { lowerBound: '0', upperBound: '3', tolerance: 1e-6 } }, 'x^2-4', {}).numericValue - 2) < 1e-5);
});
test('malformed and hostile formulas remain inert and bounded', () => {
  assert.equal(readCalculations(calculationMarkdown({ ...result, kind: 'unknown' })).length, 0);
  assert.throws(() => recalculate(result, 'process.exit()', {}));
  assert.throws(() => recalculate(result, 'a', { a: Infinity }));
  assert.throws(() => recalculate(result, 'a', []));
  assert.equal(readCalculations(Array(30).fill(calculationMarkdown(result)).join('\n')).length, 20);
});

test('imported context cannot inject React children or invalid settings', () => {
  for (const context of [{ angleUnit: { malicious: true } }, { variables: [] }, { format: { precision: 100000 } }, { point: {} }, { tolerance: -1 }]) {
    assert.equal(readCalculations(calculationMarkdown({ ...result, context })).length, 0);
  }
});

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { deserializeBoard } = require('@sunaissu/noteboard');

const filename = path.resolve(__dirname, '../src/model/note.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { sanitizeNoteboardElements, sanitizeNoteboardViewport } = compiled.exports;
const shape = { id: 'shape', type: 'rectangle', x: 10, y: 20, width: 80, height: 60 };
const viewport = { panX: 0, panY: 0, zoom: 1 };
const metadata = {
  hidden: true, displayName: 'Hidden planning card',
  link: { kind: 'object', target: 'other' },
  ports: [{ id: 'out', name: 'Output', point: { x: 1, y: 0.5 }, accepts: ['arrow'] }],
  documentCard: { documentId: 'doc', revision: '2', title: 'Approved excerpt', fallback: 'Host-provided text', stale: true },
  calculation: { version: 1, expression: 'x + 2', variables: { x: 3 }, result: '5' },
};

test('current Noteboard fields survive host sanitation and package serialization', () => {
  const input = [
    { ...shape, ...metadata },
    { id: 'connector', type: 'arrow', x: 90, y: 50, width: 120, height: 20,
      points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: 120, y: 20 }],
      routing: 'orthogonal', manualRoute: true,
      startBinding: { elementId: 'shape', portId: 'out', fixedPoint: { x: 1, y: 0.5 } } },
    { id: 'asset', type: 'image', x: 0, y: 100, width: 80, height: 50, dataUrl: '',
      assetId: 'host-asset', mask: 'ellipse', crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } },
  ];
  const clean = sanitizeNoteboardElements(input);
  assert.equal(clean.length, 3);
  for (const key of Object.keys(metadata)) assert.deepEqual(clean[0][key], metadata[key], key);
  assert.equal(clean[1].manualRoute, true);
  assert.equal(clean[1].startBinding.portId, 'out');
  assert.deepEqual(clean[2].crop, input[2].crop);
  assert.equal(clean[2].assetId, 'host-asset');
  assert.equal(clean[2].mask, 'ellipse');
  const roundtrip = deserializeBoard(JSON.parse(JSON.stringify({ elements: clean, viewport }))).elements;
  assert.deepEqual(sanitizeNoteboardElements(roundtrip), clean);
});

test('new nested metadata is copied without allowing unknown fields into shared state', () => {
  const input = { ...shape, ...metadata, injected: { value: 'discard' },
    link: { ...metadata.link, script: 'discard' },
    ports: [{ ...metadata.ports[0], script: 'discard', point: { x: 1, y: 0.5, extra: true } }],
    documentCard: { ...metadata.documentCard, credentials: 'discard' },
    calculation: { ...metadata.calculation, privateHistory: ['discard'] },
  };
  const [clean] = sanitizeNoteboardElements([input]);
  assert.equal(clean.injected, undefined);
  assert.deepEqual(clean.link, metadata.link);
  assert.deepEqual(clean.ports, metadata.ports);
  assert.deepEqual(clean.documentCard, metadata.documentCard);
  assert.deepEqual(clean.calculation, metadata.calculation);
  clean.ports[0].point.x = 0;
  clean.calculation.variables.x = 7;
  assert.equal(input.ports[0].point.x, 1);
  assert.equal(input.calculation.variables.x, 3);
  assert.equal(sanitizeNoteboardElements([{ ...shape, id: 'plain' }])[0].calculation, undefined);
});

test('invalid new fields are quarantined while valid neighboring objects remain', () => {
  for (const invalid of [
    { hidden: 'true' }, { displayName: 'x'.repeat(257) },
    { link: { kind: 'url', target: 'javascript:alert(1)' } },
    { ports: [{ ...metadata.ports[0], point: { x: 2, y: 0 } }] },
    { ports: [metadata.ports[0], metadata.ports[0]] },
    { documentCard: { ...metadata.documentCard, stale: 'yes' } },
    { calculation: { ...metadata.calculation, variables: { x: Infinity } } },
    { calculation: { ...metadata.calculation, variables: [] } },
    { type: 'image', dataUrl: '', assetId: '' },
    { type: 'image', dataUrl: '', assetId: 'asset', crop: { x: 0.8, y: 0, width: 0.5, height: 1 } },
    { type: 'arrow', points: [], manualRoute: 'yes' },
    { type: 'arrow', points: [], startBinding: { elementId: 'shape', fixedPoint: { x: 0, y: 0 }, portId: 7 } },
  ]) {
    const output = sanitizeNoteboardElements([{ ...shape, ...invalid }, { ...shape, id: 'valid' }]);
    assert.deepEqual(output.map(element => element.id), ['valid'], JSON.stringify(invalid));
  }
  assert.equal(sanitizeNoteboardElements([shape, shape]).length, 1);
  assert.deepEqual(sanitizeNoteboardViewport({ panX: Infinity, panY: 20, zoom: 10 }), { panX: 0, panY: 20, zoom: 5 });
});

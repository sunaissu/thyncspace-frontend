const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Y = require('yjs');
const { createElement } = require('@sunaissu/noteboard');
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const compiled = new Module(filename, module);
  cache.set(filename, compiled);
  compiled.filename = filename; compiled.paths = module.paths;
  const native = Module.createRequire(filename);
  compiled.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name + '.ts')) : native(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return compiled.exports;
}
const {
  createDocumentation, parseDocumentation, serializeDocumentation, documentationPlainText,
  readDocumentation, writeDocumentationSection, documentationOrder, previewDocumentationHistory,
  DOCUMENTATION_SECTIONS_KEY, DOCUMENTATION_ORDER_KEY, documentationKeys,
} = load(path.resolve(__dirname, '../src/util/documentation.ts'));

function fixture() {
  return { format: 'thyncspace-documentation', version: 1, sections: [
    { id: 'intro', type: 'text', title: 'Overview', content: 'A shared explanation.' },
    { id: 'diagram', type: 'board', title: 'Flow', caption: 'An example flow.', height: 440,
      elements: [createElement('rectangle', { id: 'shape-one', x: 10, y: 20, width: 100, height: 70, text: 'Visible step' })], viewport: { panX: 0, panY: 0, zoom: 1 } },
  ] };
}
function seed(doc, content = fixture()) {
  doc.transact(() => {
    for (const section of content.sections) writeDocumentationSection(doc, section);
    doc.getArray(DOCUMENTATION_ORDER_KEY).insert(0, content.sections.map(section => section.id));
  }, 'seed');
}

test('documentation validates section identities, bounds, UTF-8 size and invalid diagrams', () => {
  const valid = fixture();
  assert.deepEqual(parseDocumentation(serializeDocumentation(valid)), valid);
  const bad = [
    { ...valid, version: 2 },
    { ...valid, sections: [valid.sections[0], valid.sections[0]] },
    { ...valid, sections: [{ ...valid.sections[0], id: '../bad' }] },
    { ...valid, sections: [{ ...valid.sections[0], content: '😀'.repeat(262144) }] },
    { ...valid, sections: Array.from({ length: 41 }, (_, index) => ({ ...valid.sections[0], id: `s${index}` })) },
    { ...valid, sections: [{ ...valid.sections[1], height: 901 }] },
    { ...valid, sections: [{ ...valid.sections[1], viewport: { panX: 0, panY: 0, zoom: 99 } }] },
    { ...valid, sections: [{ ...valid.sections[1], elements: [{ id: 'unknown', type: 'script' }] }] },
  ];
  for (const value of bad) assert.equal(parseDocumentation(value), null);
  assert.equal(parseDocumentation('{bad'), null);
  assert.throws(() => serializeDocumentation(bad[3]), /1 MiB/);
});

test('starter templates have unique sections and text extraction excludes deleted and hidden board text', () => {
  for (const template of ['blank', 'project', 'meeting']) {
    const content = createDocumentation(template);
    assert.ok(parseDocumentation(content));
    assert.equal(new Set(content.sections.map(section => section.id)).size, content.sections.length);
  }
  const content = fixture();
  content.sections[1].elements.push(createElement('text', { id: 'hidden', text: 'Secret hidden text', hidden: true }));
  assert.match(documentationPlainText(content), /Visible step/);
  assert.doesNotMatch(documentationPlainText(content), /Secret hidden text/);
});

test('section materialization keeps raw board properties, excludes orphan stores and normalizes concurrent order', () => {
  const doc = new Y.Doc();
  try {
    const content = fixture();
    delete content.sections[1].elements[0].dropShadow;
    seed(doc, content);
    const boardKeys = documentationKeys('diagram');
    assert.ok(doc.getMap(boardKeys.elements).get('shape-one').get('text') instanceof Y.Text);
    doc.getArray(DOCUMENTATION_ORDER_KEY).insert(0, ['diagram', 'diagram', 'missing']);
    assert.deepEqual(readDocumentation(doc).sections.map(section => section.id), ['diagram', 'intro']);
    assert.equal(Object.hasOwn(readDocumentation(doc).sections[0].elements[0], 'dropShadow'), false);
    doc.getMap(DOCUMENTATION_SECTIONS_KEY).delete('diagram');
    assert.ok(doc.getMap(boardKeys.elements).size);
    assert.deepEqual(readDocumentation(doc).sections.map(section => section.id), ['intro']);
    assert.deepEqual(documentationOrder(['b', 'b', 'missing'], ['c', 'a', 'b']), ['b', 'a', 'c']);
  } finally { doc.destroy(); }
});

test('concurrent independent section edits and moves converge without losing text or objects', () => {
  const first = new Y.Doc(), second = new Y.Doc();
  try {
    seed(first); Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
    first.getText(documentationKeys('intro').text).insert(0, 'First author. ');
    second.getMap(documentationKeys('diagram').elements).get('shape-one').get('text').insert(0, 'Second author. ');
    first.getArray(DOCUMENTATION_ORDER_KEY).insert(0, ['diagram']);
    second.getArray(DOCUMENTATION_ORDER_KEY).insert(0, ['intro']);
    const updateA = Y.encodeStateAsUpdate(first), updateB = Y.encodeStateAsUpdate(second);
    Y.applyUpdate(first, updateB); Y.applyUpdate(second, updateA);
    assert.deepEqual(readDocumentation(first), readDocumentation(second));
    assert.match(readDocumentation(first).sections.find(section => section.id === 'intro').content, /First author/);
    assert.match(readDocumentation(first).sections.find(section => section.id === 'diagram').elements[0].text, /Second author/);
    assert.equal(readDocumentation(first).sections.length, 2);
  } finally { first.destroy(); second.destroy(); }
});

test('undo restores a removed section with its latest content and malformed metadata stays visibly invalid', () => {
  const doc = new Y.Doc();
  try {
    seed(doc);
    const metadata = doc.getMap(DOCUMENTATION_SECTIONS_KEY), order = doc.getArray(DOCUMENTATION_ORDER_KEY), origin = {};
    const history = new Y.UndoManager([metadata, order], { trackedOrigins: new Set([origin]) });
    doc.transact(() => { metadata.delete('intro'); order.delete(0, 1); }, origin);
    doc.getText(documentationKeys('intro').text).insert(0, 'Concurrent retained edit. ');
    assert.equal(readDocumentation(doc).sections.length, 1);
    history.undo();
    assert.match(readDocumentation(doc).sections.find(section => section.id === 'intro').content, /Concurrent retained edit/);
    history.destroy();
    metadata.get('intro').set('type', 'unsupported');
    assert.throws(() => readDocumentation(doc), /unsupported section/);
  } finally { doc.destroy(); }
});

test('section history previews reject peer-grown section and byte limits without changing live state', () => {
  const doc = new Y.Doc();
  try {
    const content = { ...fixture(), sections: Array.from({ length: 40 }, (_, index) => ({ id: `s${index}`, type: 'text', title: '', content: '' })) };
    seed(doc, content);
    const metadata = doc.getMap(DOCUMENTATION_SECTIONS_KEY), order = doc.getArray(DOCUMENTATION_ORDER_KEY), origin = {};
    const history = new Y.UndoManager([metadata, order], { trackedOrigins: new Set([origin]) });
    doc.transact(() => { metadata.delete('s0'); order.delete(0, 1); }, origin);
    writeDocumentationSection(doc, { id: 'peer', type: 'text', title: 'Peer section', content: '' });
    const before = Y.encodeStateAsUpdate(doc), undoLength = history.undoStack.length;
    let updates = 0; doc.on('update', () => updates++);
    assert.throws(() => previewDocumentationHistory(doc, history, 'undo'), /40 sections/);
    assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
    assert.equal(history.undoStack.length, undoLength);
    assert.equal(updates, 0);
    metadata.delete('peer');
    const expected = previewDocumentationHistory(doc, history, 'undo');
    history.undo();
    assert.deepEqual(readDocumentation(doc), expected);
    assert.equal(expected.sections.length, 40);
    history.destroy();
  } finally { doc.destroy(); }
  for (const action of ['undo', 'redo']) {
    const doc = new Y.Doc();
    try {
      const keep = { id: 'keep', type: 'text', title: '', content: '' };
      const restore = { id: 'restore', type: 'text', title: '', content: 'a'.repeat(600000) };
      seed(doc, { ...fixture(), sections: action === 'undo' ? [keep, restore] : [keep] });
      const metadata = doc.getMap(DOCUMENTATION_SECTIONS_KEY), order = doc.getArray(DOCUMENTATION_ORDER_KEY), origin = {};
      const history = new Y.UndoManager([metadata, order], { trackedOrigins: new Set([origin]) });
      if (action === 'undo') doc.transact(() => { metadata.delete('restore'); order.delete(1, 1); }, origin);
      else {
        doc.transact(() => { writeDocumentationSection(doc, restore); order.push(['restore']); }, origin);
        history.undo();
      }
      doc.getText(documentationKeys('keep').text).insert(0, 'b'.repeat(500000));
      const before = Y.encodeStateAsUpdate(doc);
      assert.throws(() => previewDocumentationHistory(doc, history, action), /1 MiB/);
      assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
      assert.equal(readDocumentation(doc).sections.length, 1);
      history.destroy();
    } finally { doc.destroy(); }
  }
});

test('disposable history preview matches repeated live undo and redo with peer edits and redone links', () => {
  const doc = new Y.Doc();
  try {
    seed(doc);
    const metadata = doc.getMap(DOCUMENTATION_SECTIONS_KEY), order = doc.getArray(DOCUMENTATION_ORDER_KEY), origin = {};
    const history = new Y.UndoManager([metadata, order], { trackedOrigins: new Set([origin]), captureTimeout: 0 });
    const step = action => {
      const before = Y.encodeStateAsUpdate(doc);
      const undoLength = history.undoStack.length, redoLength = history.redoStack.length;
      const expected = previewDocumentationHistory(doc, history, action);
      assert.deepEqual(Y.encodeStateAsUpdate(doc), before);
      assert.equal(history.undoStack.length, undoLength);
      assert.equal(history.redoStack.length, redoLength);
      history[action]();
      assert.deepEqual(readDocumentation(doc), expected);
    };
    doc.transact(() => { metadata.get('intro').set('title', 'Local title'); }, origin);
    doc.transact(() => { metadata.delete('intro'); order.delete(0, 1); }, origin);
    doc.getText(documentationKeys('intro').text).insert(0, 'Latest peer edit. ');
    for (let cycle = 0; cycle < 5; cycle++) {
      step('undo'); step('undo'); step('redo'); step('redo');
    }
    step('undo');
    metadata.get('intro').set('title', 'Peer title');
    step('undo');
    assert.equal(readDocumentation(doc).sections.find(section => section.id === 'intro').title, 'Peer title');
    assert.match(readDocumentation(doc).sections.find(section => section.id === 'intro').content, /Latest peer edit/);
    history.destroy();
  } finally { doc.destroy(); }
});

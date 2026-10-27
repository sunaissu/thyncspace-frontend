const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(relative, replacements = {}) {
  const filename = path.resolve(__dirname, relative);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  const original = compiled.require.bind(compiled);
  compiled.require = name => replacements[name] || original(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
  return compiled.exports;
}
const wiki = load('../src/util/wikiLinks.ts');
const utility = load('../src/util/noteConnections.ts', { './wikiLinks': wiki });
const makeNote = (id, title, content = '', sourcePath) => ({ _id: id, title, content, sourcePath, type: 'document' });
const ids = notes => notes.map(note => note._id);

test('typing reparses only the changed document while preserving backlinks', () => {
  let parses = 0;
  const { createNoteConnectionIndex } = load('../src/util/noteConnections.ts', {
    './wikiLinks': { ...wiki, wikiReferences(source) { parses++; return wiki.wikiReferences(source); } },
  });
  const query = createNoteConnectionIndex();
  let notes = Array.from({ length: 100 }, (_, index) => makeNote(`id-${index}`, `Note ${index}`, index ? '[[id-0]]' : '[[id-1]]'));
  assert.equal(query(notes, notes[0]).backlinks.length, 99);
  assert.equal(parses, 100);
  for (let index = 0; index < 10; index++) {
    notes = notes.map((note, position) => position ? note : { ...note, content: note.content + 'x' });
    const result = query(notes, notes[0]);
    assert.equal(result.backlinks.length, 99);
    assert.deepEqual(ids(result.outgoing[0].matches), ['id-1']);
  }
  assert.equal(parses, 110);
  notes = notes.map(note => ({ ...note, updatedAt: 'updated metadata' }));
  query(notes, notes[0]);
  assert.equal(parses, 110, 'metadata snapshots do not cause content reparsing');
});

test('renames, relative paths, ambiguity, and access removal invalidate cached resolution', () => {
  const query = utility.createNoteConnectionIndex();
  const source = makeNote('source', 'Source', '[[Target]]\n[[stable|Stable alias]]', 'folder/source.md');
  const target = makeNote('target', 'Target', '', 'folder/Target.md');
  const stable = makeNote('stable', 'Original stable name');
  let notes = [source, target, stable];
  assert.deepEqual(ids(query(notes, target).backlinks), ['source']);
  assert.deepEqual(query(notes, source).outgoing.map(link => ids(link.matches)), [['target'], ['stable']]);
  notes = notes.map(note => note._id === 'target' ? { ...note, title: 'Renamed', sourcePath: 'folder/Renamed.md' } : note);
  assert.deepEqual(query(notes, source).outgoing[0].matches, []);
  notes = [...notes, makeNote('duplicate-a', 'Target'), makeNote('duplicate-b', 'Target')];
  assert.deepEqual(ids(query(notes, source).outgoing[0].matches), ['duplicate-a', 'duplicate-b']);
  assert.deepEqual(query(notes, notes[3]).backlinks, [], 'ambiguous names create no backlinks');
  notes = notes.filter(note => note._id !== 'duplicate-b' && note._id !== 'stable');
  assert.deepEqual(ids(query(notes, notes[2]).backlinks), ['source']);
  assert.deepEqual(query(notes, source).outgoing[1].matches, [], 'removed notes cannot survive in the index');
  notes = notes.map(note => note._id === 'source' ? { ...note, sourcePath: 'other/source.md' } : note);
  notes.push(makeNote('relative', 'Other target', '', 'other/Target.md'));
  assert.deepEqual(ids(query(notes, notes[0]).outgoing[0].matches), ['relative']);
});

test('removed links, changed note types, new notes, and renamed stable IDs refresh immediately', () => {
  const query = utility.createNoteConnectionIndex();
  let notes = [makeNote('source', 'Source', '[[target]]'), makeNote('target', 'Target')];
  assert.deepEqual(ids(query(notes, notes[1]).backlinks), ['source']);
  notes = [{ ...notes[0], content: '`[[target]]` <!-- [[target]] -->' }, notes[1]];
  assert.deepEqual(query(notes, notes[1]).backlinks, []);
  notes = [{ ...notes[0], content: '[[target]]' }, { ...notes[1], title: 'Renamed target' }];
  assert.equal(query(notes, notes[0]).neighbors[0].title, 'Renamed target');
  notes = [{ ...notes[0], type: 'whiteboard', content: '' }, notes[1]];
  assert.deepEqual(query(notes, notes[1]).backlinks, []);
  notes.push(makeNote('new', 'New source', '[[target]]'));
  assert.deepEqual(ids(query(notes, notes[1]).backlinks), ['new']);
  notes = notes.filter(note => note._id !== 'new');
  assert.deepEqual(query(notes, notes[1]).backlinks, []);
});

test('large backlink lists initially render a bounded batch with a way to show the rest', () => {
  const { default: NoteConnections } = load('../src/components/noteConnections.tsx', { '../util/noteConnections': utility });
  const target = makeNote('target', 'Target');
  const notes = [target, ...Array.from({ length: 250 }, (_, index) => makeNote(`source-${index}`, `Source ${index}`, '[[target]]'))];
  const html = renderToStaticMarkup(React.createElement(NoteConnections, { notes, note: target, onOpen() {}, onClose() {} }));
  const backlinks = html.split('<h3>Backlinks</h3>')[1].split('</section>')[0];
  assert.equal((backlinks.match(/<li>/g) || []).length, 100);
  assert.match(backlinks, /Show 100 more backlinks \(250 total\)/);
  assert.match(html, /Graph of Target and 24 connected notes/);
});

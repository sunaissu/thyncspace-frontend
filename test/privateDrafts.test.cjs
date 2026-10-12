const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/privateNoteDraft.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);

const { indexedDB, IDBKeyRange } = require('fake-indexeddb');
global.window = { indexedDB }; global.IDBKeyRange = IDBKeyRange;
const drafts = compiled.exports;
test('drafts remain independent across tabs, notes, accounts and stale cleanup', async () => {
 const one = drafts.privateDraftPrefix('owner', 'note') + 'tab-a';
 const two = drafts.privateDraftPrefix('owner', 'note') + 'tab-b';
 const other = drafts.privateDraftPrefix('other-account', 'note') + 'tab-a';
 const make = (noteId, value) => ({ noteId, value, baseRevisionKey: 'base', contentRevisionKey: value, updatedAt: new Date().toISOString() });
 await drafts.writePrivateNoteDraft(make(one, 'left'));
 await drafts.writePrivateNoteDraft(make(two, 'right'));
 await drafts.writePrivateNoteDraft(make(other, 'secret'));
 assert.deepEqual((await drafts.listPrivateNoteDrafts('owner', 'note')).map(d => d.value).sort(), ['left', 'right']);
 assert.deepEqual(await drafts.listPrivateNoteDrafts('owner', 'different-note'), []);
 assert.equal(await drafts.deletePrivateNoteDraftIfContentRevision(one, 'stale'), false);
 assert.equal(await drafts.deletePrivateNoteDraftIfContentRevision(one, 'left'), true);
 assert.equal((await drafts.readPrivateNoteDraft(two)).value, 'right');
 assert.equal((await drafts.listPrivateNoteDrafts('other-account', 'note'))[0].value, 'secret');
});
test('revision hashing distinguishes content changes', async () => {
 assert.equal(await drafts.privateNoteRevisionKey('same'), await drafts.privateNoteRevisionKey('same'));
 assert.notEqual(await drafts.privateNoteRevisionKey('same'), await drafts.privateNoteRevisionKey('different'));
});


test('storage denial keeps a recoverable in-memory copy during navigation', async () => {
 const saved = global.window.indexedDB;
 global.window.indexedDB = undefined;
 try {
  const noteId = drafts.privateDraftPrefix('offline-owner', 'note') + 'session';
  assert.equal(await drafts.writePrivateNoteDraft({ noteId, value: 'retained without storage', baseRevisionKey: 'base', contentRevisionKey: 'draft', updatedAt: new Date().toISOString() }), false);
  assert.equal((await drafts.listPrivateNoteDrafts('offline-owner', 'note'))[0].value, 'retained without storage');
  assert.deepEqual(await drafts.listPrivateNoteDrafts('another-owner', 'note'), []);
 } finally { global.window.indexedDB = saved; }
});

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/offlineLibrary.ts');
const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { IDBFactory } = require('fake-indexeddb');
const offline = compiled.exports, owner = 'a'.repeat(24), other = 'b'.repeat(24);
const make = (id = 'c'.repeat(24), account = owner) => ({ _id: id, owner: account, title: 'Offline note', type: 'document', content: 'Server content', contentRevision: 4, sharedWith: [] });

test('offline copies isolate accounts and stale tabs cannot replace queued edits', async () => {
 global.indexedDB = new IDBFactory();
 const source = make(), first = await offline.cacheOfflineNote(owner, 'Owner', source);
 await offline.cacheOfflineNote(other, 'Other', make(source._id, other));
 const outcomes = await Promise.allSettled(['Tab A', 'Tab B'].map(pending => offline.putOfflineNote({ ...first, pending }, first.revision)));
 assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
 await assert.rejects(offline.cacheOfflineNote(owner, 'Owner', source), /queued offline edits/);
 await assert.rejects(offline.deleteOfflineNote(owner, source._id, first.revision), /changed in another tab/);
 const cached = (await offline.listOfflineNotes(owner))[0]; assert.ok(cached.pending); assert.equal(cached.baseRevision, 4);
 assert.equal((await offline.listOfflineNotes(other))[0].pending, null);
 await offline.deleteOfflineNote(owner, source._id, cached.revision); assert.equal((await offline.listOfflineNotes(other)).length, 1);
});
test('offline admission keeps shared notes read-only and enforces byte limits durably', async () => {
 global.indexedDB = new IDBFactory();
 const shared = await offline.cacheOfflineNote(owner, 'Owner', { ...make(), sharedWith: [{ userId: other, permission: 'editor' }] });
 assert.equal(shared.editable, false);
 await assert.rejects(offline.putOfflineNote({ ...shared, pending: 'é'.repeat(524289) }, shared.revision), /1 MiB/);
 assert.equal((await offline.listOfflineNotes(owner))[0].pending, null);
 for (let index = 0; index < 19; index++) await offline.cacheOfflineNote(owner, 'Owner', { ...make(String(index).padStart(24, '0')), content: 'x'.repeat(1048576) });
 const second = (await offline.listOfflineNotes(owner)).find(note => note.noteId === '0'.repeat(24));
 await assert.rejects(offline.putOfflineNote({ ...second, pending: 'y'.repeat(1048576) }, second.revision), /20 MiB/);
 assert.equal((await offline.listOfflineNotes(owner)).find(note => note.noteId === second.noteId).pending, null);
});
test('concurrent offline caching cannot exceed the note count limit', async () => {
 global.indexedDB = new IDBFactory();
 for (let index = 0; index < 99; index++) await offline.cacheOfflineNote(owner, 'Owner', make(String(index).padStart(24, '0')));
 const outcomes = await Promise.allSettled([100, 101].map(index => offline.cacheOfflineNote(owner, 'Owner', make(String(index).padStart(24, '0')))));
 assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1); assert.equal((await offline.listOfflineNotes(owner)).length, 100);
});
test('offline storage failures never report a durable save', async () => {
 global.indexedDB = undefined;
 await assert.rejects(offline.cacheOfflineNote(owner, 'Owner', make()), /unavailable/);
});

test('damaged offline records remain downloadable before an explicit reset', async () => {
 global.indexedDB = new IDBFactory();
 await offline.cacheOfflineNote(owner, 'Owner', make());
 const database = await new Promise(resolve => { const request = indexedDB.open('thyncspace-offline-library', 1); request.onsuccess = () => resolve(request.result); });
 await new Promise(resolve => { const transaction = database.transaction('notes', 'readwrite'); transaction.objectStore('notes').put({ account: owner, noteId: 'd'.repeat(24), pending: 'Recover this damaged record' }); transaction.oncomplete = resolve; }); database.close();
 await assert.rejects(offline.listOfflineNotes(owner), /raw recovery/);
 const raw = await offline.rawOfflineRecovery(); assert.equal(raw.length, 2); assert.equal(raw[1].pending, 'Recover this damaged record');
 await offline.resetOfflineLibrary(); assert.deepEqual(await offline.listOfflineNotes(), []);
});

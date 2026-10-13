const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/studyCards.ts');
const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
const { indexedDB } = require('fake-indexeddb'); global.window = { indexedDB };
const study = compiled.exports, owner = 'a'.repeat(24), other = 'b'.repeat(24);
const make = (id, account = owner) => ({ id, owner: account, revision: 0, noteId: 'c'.repeat(24), noteTitle: 'Physics', question: 'What is force?', answer: 'Mass times acceleration.', source: 'Force: Mass times acceleration.', sourceUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reviewed: 0, known: 0 });

test('study drafts quote selected source and ignore fenced examples with bounded output', () => {
 const text = 'Force: Mass times acceleration.\n\nQ: What is velocity?\nA: Displacement per unit time.\n\n## Energy\n\nThe capacity to do work.\n\n```text\nHidden: Do not use this sample.\n```';
 const cards = study.createStudyDrafts(text);
 assert.equal(cards.length, 3); assert.deepEqual(cards.map(card => card.answer), ['Mass times acceleration.', 'Displacement per unit time.', 'The capacity to do work.']);
 cards.forEach(card => assert.ok(text.includes(card.source)));
 assert.throws(() => study.createStudyDrafts('x'.repeat(20001)), /20,000/);
 assert.equal(study.createStudyDrafts(Array.from({ length: 25 }, (_, index) => 'Term ' + index + ': A definition.').join('\n')).length, 20);
});
test('private study storage isolates accounts and rejects stale updates/deletions across tabs', async () => {
 const id = '11111111-1111-4111-8111-111111111111';
 const initial = await study.writeStudyCard(make(id), null);
 await study.writeStudyCard(make(id, other), null);
 const outcomes = await Promise.allSettled([study.writeStudyCard({ ...initial, answer: 'Edited by tab A' }, initial.revision), study.writeStudyCard({ ...initial, answer: 'Edited by tab B' }, initial.revision)]);
 assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
 await assert.rejects(study.deleteStudyCard(owner, id, initial.revision), /changed in another tab/);
 const saved = (await study.listStudyCards(owner))[0]; assert.equal(saved.revision, 1);
 assert.equal((await study.listStudyCards(other))[0].answer, 'Mass times acceleration.');
 await study.deleteStudyCard(owner, id, saved.revision);
 assert.deepEqual(await study.listStudyCards(owner), []); assert.equal((await study.listStudyCards(other)).length, 1);
 await assert.rejects(study.writeStudyCard(saved, saved.revision), /changed in another tab/);
});
test('study storage rejects oversized or malformed cards and makes storage failure explicit', async () => {
 const card = make('22222222-2222-4222-8222-222222222222');
 for (const patch of [{ answer: 'a'.repeat(4001) }, { question: {} }, { source: 'x'.repeat(8001) }, { known: 2, reviewed: 1 }]) await assert.rejects(study.writeStudyCard({ ...card, ...patch }, null), /invalid or oversized/);
 const saved = global.window.indexedDB; global.window.indexedDB = undefined;
 try { await assert.rejects(study.writeStudyCard(card, null), /storage is unavailable/); } finally { global.window.indexedDB = saved; }
});
test('concurrent study creation cannot exceed the per-account storage limit', async () => {
 const account = 'd'.repeat(24);
 for (let index = 0; index < 199; index++) await study.writeStudyCard(make(crypto.randomUUID(), account), null);
 const results = await Promise.allSettled([1, 2].map(() => study.writeStudyCard(make(crypto.randomUUID(), account), null)));
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
 assert.equal((await study.listStudyCards(account)).length, 200);
});

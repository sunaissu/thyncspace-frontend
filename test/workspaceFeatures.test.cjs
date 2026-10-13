const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative) {
 const filename = path.resolve(__dirname, '../src', relative);
 const compiled = new Module(filename, module);
 const nativeRequire = compiled.require.bind(compiled);
 compiled.require = name => name.startsWith(".") ? load(path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(filename), name + ".ts"))) : nativeRequire(name);
 compiled.filename = filename; compiled.paths = module.paths;
 compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
 return compiled.exports;
}
const { collectNoteTasks } = load('util/noteTasks.ts');
const { normalizeEditorPreferences } = load('hooks/useEditorPreferences.ts');
test('task aggregation preserves source locations, completion and valid dates while ignoring fenced code', () => {
 const content = ['- [ ] Open due:2026-10-01', '- [x] Done 📅 2026-10-02', '- [ ] Invalid due:2026-02-31', '~~~md', '- [ ] Code sample', '~~~', '1. [ ] Numbered', '  - [X] Nested'].join('\n');
 const tasks = collectNoteTasks([{ _id: 'note', title: 'Source', type: 'document', content }]);
 assert.deepEqual(tasks.map(t => [t.line, t.done, t.due]), [[1, false, '2026-10-01'], [2, true, '2026-10-02'], [3, false, undefined], [7, false, undefined], [8, true, undefined]]);
 assert.ok(tasks.every(t => t.noteId === 'note' && t.noteTitle === 'Source'));
 assert.equal(collectNoteTasks([{ type: 'whiteboard', content }]).length, 0);
});
test('task output and persisted editor settings remain bounded', () => {
 assert.equal(collectNoteTasks([{ _id: 'n', title: 'n', type: 'document', content: '- [ ] task\n'.repeat(6000) }]).length, 5000);
 assert.deepEqual(normalizeEditorPreferences({ mode: 'script', fontSize: 9999, lineWidth: {}, noteType: [] }), { mode: 'visual', fontSize: 16, lineWidth: 'full', noteType: 'document' });
 assert.deepEqual(normalizeEditorPreferences({ mode: 'markdown', fontSize: 20, lineWidth: 'reading', noteType: 'whiteboard' }), { mode: 'markdown', fontSize: 20, lineWidth: 'reading', noteType: 'whiteboard' });
});

const { matchesFilters, noteSearchSnippet } = load('util/noteSearch.ts');
test('advanced filters combine owner, exact tags, type and inclusive UTC dates', () => {
 const note = { owner: 'me', type: 'document', tags: ['math'], updatedAt: '2026-10-01T23:59:00Z', content: 'needle in a document' };
 const filters = { owner: 'mine', type: 'document', tag: ' MATH ', from: '2026-10-01', to: '2026-10-01' };
 assert.equal(matchesFilters(note, filters, 'me'), true);
 for (const change of [{ owner: 'shared' }, { type: 'whiteboard' }, { tag: 'mat' }, { from: '2026-10-02' }, { to: '2026-09-30' }]) assert.equal(matchesFilters(note, { ...filters, ...change }, 'me'), false);
 assert.match(noteSearchSnippet({ ...note, content: 'a'.repeat(500) + ' needle ' + 'b'.repeat(500) }, 'needle'), /needle/);
 assert.ok(noteSearchSnippet({ ...note, content: 'a'.repeat(500) }, 'a').length <= 182);
 assert.equal(noteSearchSnippet({ type: 'whiteboard', content: JSON.stringify({ elements: [{ text: 'Visible' }, { text: 'Hidden', isDeleted: true }] }) }, ''), 'Visible');
});

const { buildWikiIndex, wikiReferences, wikiMarkup } = load('util/wikiLinks.ts');
const { reviewVaultImport } = load('util/vaultPreview.ts');
test('wiki links resolve stable IDs, relative paths and ambiguous names without inventing access', () => {
 const notes = [{ _id: '1', title: 'Topic', sourcePath: 'Vault/Topic.md' }, { _id: '2', title: 'Topic', sourcePath: 'Elsewhere/Topic.md' }];
 const resolve = buildWikiIndex(notes);
 assert.deepEqual(resolve('Topic').map(note => note._id), ['1', '2']);
 assert.deepEqual(resolve('Topic#Heading', { sourcePath: 'Vault/Source.md' }).map(note => note._id), ['1']);
 assert.deepEqual(resolve('1').map(note => note._id), ['1']);
 assert.deepEqual(resolve('private-note'), []);
 assert.equal(wikiMarkup({ _id: '1', title: 'Changed [title]|now' }), '[[1|Changed  title  now]]');
 const fence = String.fromCharCode(96).repeat(3);
 const links = wikiReferences(['[[Topic|Alias]]', fence, '[[Code]]', fence, String.fromCharCode(96) + '[[Inline]]' + String.fromCharCode(96), '<!-- [[Hidden]] -->', '![[image.png]]', '\\[[Escaped]]'].join('\n'));
 assert.deepEqual(links.map(link => [link.target, link.embedded]), [['Topic', false], ['image.png', true]]);
});
test('vault preview reports duplicate titles, broken links and missing or unimported assets', () => {
 const imported = [{ title: 'One', sourcePath: 'Vault/One.md', content: '[[Two]] [[Missing]] ![[image.png]] ![Other](absent.png)' }, { title: 'Two', sourcePath: 'Vault/Two.md', content: '' }];
 const issues = reviewVaultImport(imported, [{ _id: 'existing', title: 'One', type: 'document' }], ['Vault/One.md', 'Vault/Two.md', 'Vault/image.png']);
 assert.equal(issues.filter(issue => issue.kind === 'duplicate').length, 1);
 assert.deepEqual(issues.filter(issue => issue.kind === 'link').map(issue => issue.detail), ['Unresolved wiki link: Missing']);
 assert.ok(issues.some(issue => issue.detail.startsWith('Selected asset is not included')));
 assert.ok(issues.some(issue => issue.detail === 'Missing local asset: absent.png'));
});

test('wiki completion ignores fenced and inline code and escaped brackets', () => {
 const { wikiQueryAt } = load('util/wikiLinks.ts');
 const fence = String.fromCharCode(96).repeat(3);
 assert.deepEqual(wikiQueryAt('Prefix [[Ref', 12), { query: 'Ref', token: '[[Ref', start: 7 });
 for (const source of [fence + '\n[[Ref', '\\[[Ref', String.fromCharCode(96) + '[[Ref' + String.fromCharCode(96)]) assert.equal(wikiQueryAt(source, source.length), null);
});

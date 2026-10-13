const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const http = require('node:http');
const { createHash } = require('node:crypto');
const notices = [];
class TFile { constructor(path, text = '', binary) { this.path = path; this.text = text; this.binary = binary; this.stat = { size: binary?.length ?? Buffer.byteLength(text) }; } }
class TFolder { constructor(path) { this.path = path; } }
class StubPlugin { constructor(app) { this.app = app; this.intervals = []; } addSettingTab() {} addCommand() {} registerInterval(id) { this.intervals.push(id); } async loadData() { throw new Error('Synced plugin data must not store sync baselines'); } async saveData() { throw new Error('Synced plugin data must not store sync baselines'); } }
const shim = { Plugin: StubPlugin, PluginSettingTab: class { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }, Modal: class {}, Notice: class { constructor(message) { notices.push(message); } }, Setting: class {}, SecretComponent: class {}, TFile, TFolder };
const filename = path.resolve(__dirname, '../integrations/obsidian/main.cjs'), loaded = new Module(filename, module), nativeRequire = loaded.require.bind(loaded);
loaded.filename = filename; loaded.paths = module.paths; loaded.require = name => name === 'obsidian' ? shim : nativeRequire(name); loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
const Companion = loaded.exports, helpers = Companion.testing;
const owner = '64b000000000000000000001', id = '64b000000000000000000002', apiOrigin = 'https://api.example.test';
const remote = () => ({ id, title: 'Study', content: 'Original', revision: 0, attachmentRevision: 0 });
const digest = value => createHash('sha256').update(value).digest('hex');
test('companion metadata round-trips Markdown and rejects forged identities and unsafe destinations', () => {
 for (const content of ['Plain\ntext', '---\ntags: [physics]\ncustom: "keep this"\n---\n# Content', '---\n---\nEmpty frontmatter', 'Text\n---\nA separator', 'Quotes " and Unicode 🧪']) {
  const source = { ...remote(), content }, copy = helpers.readLocal(helpers.localText(source, apiOrigin, owner)); assert.equal(copy.content, content); assert.equal(copy.id, id); assert.equal(copy.owner, owner); assert.equal(copy.origin, apiOrigin);
 }
 assert.throws(() => helpers.localText({ ...remote(), content: '---\nthyncspace_sync_id: "user property"\n---\nbody' }, apiOrigin, owner), /reserved/);
 const raw = helpers.localText(remote(), apiOrigin, owner);
 assert.throws(() => helpers.readLocal(raw.replace('thyncspace_sync_id: "' + id + '"', 'thyncspace_sync_id: ["' + id + '"]')), /invalid/);
 assert.throws(() => helpers.readLocal(raw.replace('thyncspace_sync_id:', 'thyncspace_sync_unknown:')), /damaged/);
 assert.throws(() => helpers.readLocal(raw.replace('thyncspace_sync_owner:', 'thyncspace_sync_id:')), /duplicated/);
 for (const value of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/?key=x', 'file:///tmp']) assert.throws(() => helpers.origin(value));
 assert.equal(helpers.origin('http://127.0.0.1:3000/'), 'http://127.0.0.1:3000');
 for (const value of ['', '.', '../notes', 'Safe/../outside', '.obsidian', 'Safe/.hidden', 'C:/path', 'Safe\\path', 'Safe//path']) assert.throws(() => helpers.folderPath(value));
 assert.equal(helpers.folderPath('Study/Physics'), 'Study/Physics');
});
test('companion change detection distinguishes conflicts, missing files and lost save receipts', () => {
 const source = remote(), local = { ...source }, base = { local: helpers.signature(local), remote: helpers.signature(source) };
 assert.equal(helpers.decision(null, source), 'download'); assert.equal(helpers.decision(null, source, base), 'missing');
 assert.equal(helpers.decision(local, source), 'acknowledge'); assert.equal(helpers.decision(local, source, base), 'unchanged');
 assert.equal(helpers.decision({ ...local, content: 'Local edit' }, source, base), 'upload'); assert.equal(helpers.decision(local, { ...source, content: 'Remote edit' }, base), 'download');
 assert.equal(helpers.decision({ ...local, content: 'Local edit' }, { ...source, content: 'Remote edit' }, base), 'conflict');
 assert.equal(helpers.decision({ ...local, content: 'Same saved edit' }, { ...source, content: 'Same saved edit' }, base), 'acknowledge');
 assert.equal(helpers.decision({ ...local, content: 'Older device' }, source), 'conflict');
});
function fixture() {
 const entries = new Map(), storage = new Map(), state = { remote: remote(), available: true, patches: 0, files: [], data: new Map() };
 const vault = {
  getMarkdownFiles: () => [...entries.values()].filter(file => file instanceof TFile && file.path.endsWith('.md')),
  getAbstractFileByPath: path => entries.get(path) ?? null,
  read: async file => file.text, readBinary: async file => file.binary,
  createFolder: async path => { if (entries.has(path)) throw new Error('Already exists'); entries.set(path, new TFolder(path)); },
  create: async (path, text) => { if (entries.has(path)) throw new Error('Already exists'); const file = new TFile(path, text); entries.set(path, file); return file; },
  createBinary: async (path, value) => { if (entries.has(path)) throw new Error('Already exists'); const file = new TFile(path, '', Buffer.from(value)); entries.set(path, file); return file; },
  process: async (file, change) => { if (vault.beforeProcess) { vault.beforeProcess(file); vault.beforeProcess = null; } file.text = change(file.text); file.stat.size = Buffer.byteLength(file.text); return file.text; },
 };
 const app = { vault, workspace: { getLeavesOfType: () => [] }, loadLocalStorage: key => structuredClone(storage.get(key) ?? null), saveLocalStorage: (key, value) => { storage.set(key, structuredClone(value)); }, secretStorage: { getSecret: () => 'thy_obs_' + 'a'.repeat(43) } };
 const plugin = new Companion(app);
 const setup = async () => {
  await plugin.onload(); Object.assign(plugin.settings, { apiOrigin, folder: 'Study', secretRef: 'companion-test', owner, selected: [id] });
  plugin.request = async (url, method = 'GET', body) => {
   if (url === '/notes') return { owner, connectionId: '64b000000000000000000010', attachments: true, notes: [{ id, title: state.remote.title, available: state.available }] };
   if (url === '/connection') { state.available = false; return null; }
   if (!state.available) { const error = new Error('Unavailable'); error.status = 404; throw error; }
   if (url === '/notes/' + id + '/attachments') return structuredClone(state.files);
   if (url.includes('/attachments/')) return Buffer.from(state.data.get(url.split('/').at(-1)));
   assert.equal(url, '/notes/' + id);
   if (method === 'PATCH') { assert.equal(body.expectedRevision, state.remote.revision); state.patches++; state.remote = { ...state.remote, title: body.title, content: body.content, revision: state.remote.revision + 1 }; }
   return structuredClone(state.remote);
  };
  return plugin;
 };
 return { plugin, app, vault, entries, storage, state, setup, close: () => { plugin.onunload(); plugin.intervals.forEach(clearInterval); } };
}
test('companion sync preserves racing local edits, reviews both changed copies and isolates device baselines', async () => {
 const f = fixture(); await f.setup();
 try {
  let [row] = await f.plugin.plan(); assert.equal(row.action, 'download'); await f.plugin.apply(row, 'download');
  const file = f.vault.getMarkdownFiles()[0]; assert.equal(helpers.readLocal(file.text).content, 'Original'); assert.equal((await f.plugin.plan())[0].action, 'unchanged');
  file.text = file.text.replace('Original', 'Local edit'); [row] = await f.plugin.plan(); assert.equal(row.action, 'upload'); await f.plugin.apply(row, 'upload'); assert.equal(f.state.remote.content, 'Local edit'); assert.equal(f.state.patches, 1);
  f.app.workspace.getLeavesOfType = () => [{ view: { file, editor: { getValue: () => file.text + ' pending' } } }];
  await assert.rejects(f.plugin.plan(), /pending editor changes/); f.app.workspace.getLeavesOfType = () => [];
  f.state.remote.content = 'Remote edit'; f.state.remote.revision++; [row] = await f.plugin.plan(); assert.equal(row.action, 'download');
  f.app.workspace.getLeavesOfType = () => [{ view: { file, editor: { getValue: () => file.text } } }]; assert.equal((await f.plugin.plan())[0].action, 'open'); await assert.rejects(f.plugin.apply(row, 'download'), /Close the local document tab/); f.app.workspace.getLeavesOfType = () => [];
  file.text = file.text.replace('Local edit', 'Typing after preview'); await assert.rejects(f.plugin.apply(row, 'download'), /local file changed/); assert.ok(file.text.includes('Typing after preview'));
  [row] = await f.plugin.plan(); assert.equal(row.action, 'conflict');
  f.vault.beforeProcess = current => { current.text += '\nRacing edit'; }; await assert.rejects(f.plugin.apply(row, 'download'), /changed during download/); assert.ok(file.text.includes('Racing edit'));
  [row] = await f.plugin.plan(); await f.plugin.apply(row, 'upload'); assert.ok(f.state.remote.content.includes('Racing edit')); assert.equal(f.state.patches, 2);
  file.text += '\nAnother local change'; [row] = await f.plugin.plan(); f.state.remote.content += '\nAnother remote change'; f.state.remote.revision++;
  await assert.rejects(f.plugin.apply(row, 'upload'), /server changed after preview/); assert.equal(f.state.patches, 2);
  [row] = await f.plugin.plan(); assert.equal(row.action, 'conflict'); await f.plugin.apply(row, 'download'); assert.equal(helpers.readLocal(file.text).content, f.state.remote.content);
  const second = fixture(); await second.setup(); try {
   second.state.remote = structuredClone(f.state.remote); await second.vault.createFolder('Study'); await second.vault.create('Study/Older device.md', helpers.localText(remote(), apiOrigin, owner));
   assert.equal((await second.plugin.plan())[0].action, 'conflict'); assert.equal(second.plugin.settings.records.length, 0);
  } finally { second.close(); }
  const path = file.path; f.entries.delete(path); [row] = await f.plugin.plan(); assert.equal(row.action, 'missing'); f.plugin.settings.automatic = true; await f.plugin.review(true); assert.equal(f.vault.getMarkdownFiles().length, 0); await f.plugin.apply(row, 'download'); assert.equal(f.vault.getMarkdownFiles().length, 1);
  f.state.available = false; [row] = await f.plugin.plan(); assert.equal(row.action, 'unavailable'); assert.equal(f.vault.getMarkdownFiles().length, 1);
  await f.plugin.disconnect(); assert.equal(f.plugin.settings.automatic, false); assert.equal(f.plugin.settings.secretRef, ''); assert.equal(f.vault.getMarkdownFiles().length, 1);
 } finally { f.close(); }
});
test('companion file mapping verifies bytes and preserves modified downloads', async () => {
 const f = fixture(); await f.setup();
 try {
  f.state.remote.content = 'Original\n[Measurements](measurement.exe)\n![[measurement.exe]]\n`![[measurement.exe]]`';
  let [row] = await f.plugin.plan(); await f.plugin.apply(row, 'download');
  const bytes = Buffer.from('Mass = 5 kg'), fileId = '64b000000000000000000009';
  f.state.files = [{ id: fileId, name: 'measurement.exe', mime: 'text/plain', bytes: bytes.length, hash: digest(bytes) }]; f.state.data.set(fileId, bytes); f.state.remote.attachmentRevision++;
  [row] = await f.plugin.plan(); assert.equal(row.action, 'files'); await f.plugin.apply(row, 'files');
  const mapping = f.plugin.base(id).assets[0]; assert.ok(mapping.path.startsWith('Study/Attachments/')); assert.ok(mapping.path.endsWith('.txt')); assert.equal(mapping.id, fileId);
  const document = f.vault.getMarkdownFiles()[0]; assert.ok(document.text.includes('![[Study/Attachments/')); assert.ok(document.text.includes('`![[measurement.exe]]`')); assert.equal(helpers.readLocal(document.text).content, f.state.remote.content);
  document.text += '\nLocal writing'; f.state.remote.attachmentRevision++; [row] = await f.plugin.plan(); await f.plugin.apply(row, 'upload'); assert.ok(f.state.remote.content.includes('[Measurements](measurement.exe)')); assert.equal(f.state.remote.content.includes('Study/Attachments/'), false);
  assert.equal((await f.plugin.plan())[0].action, 'files'); [row] = await f.plugin.plan(); await f.plugin.apply(row, 'files');
  const file = f.entries.get(mapping.path); file.binary = Buffer.from('Local annotated file'); f.state.remote.attachmentRevision++;
  [row] = await f.plugin.plan(); await assert.rejects(f.plugin.apply(row, 'files'), /edited locally/); assert.equal(file.binary.toString(), 'Local annotated file');
  f.state.files = []; f.state.remote.attachmentRevision++; [row] = await f.plugin.plan(); await f.plugin.apply(row, 'files'); assert.deepEqual(f.plugin.base(id).assets, []); assert.equal(file.binary.toString(), 'Local annotated file');
 } finally { f.close(); }
});
test('native transport rejects redirects, oversized responses and revoked credentials without exposing diagnostics', async () => {
 let redirected = 0;
 const sink = http.createServer((_req, res) => { redirected++; res.end('unexpected'); }); await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
 let mode = 'ok'; const server = http.createServer((req, res) => {
  assert.equal(req.headers.authorization, 'Bearer thy_obs_' + 'a'.repeat(43));
  if (mode === 'redirect') { res.writeHead(302, { Location: `http://127.0.0.1:${sink.address().port}/secret` }); res.end(); }
  else if (mode === 'large') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('x'.repeat(4 * 1024 * 1024 + 1)); }
  else if (mode === 'revoked') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'provider-secret-diagnostic' })); }
  else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"notes":[]}'); }
 }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 try {
  const base = `http://127.0.0.1:${server.address().port}`, token = 'thy_obs_' + 'a'.repeat(43);
  assert.deepEqual(await helpers.apiRequest(base, token, '/notes'), { notes: [] });
  mode = 'redirect'; await assert.rejects(helpers.apiRequest(base, token, '/notes'), /rejected/); assert.equal(redirected, 0);
  mode = 'large'; await assert.rejects(helpers.apiRequest(base, token, '/notes'), /exceeds/);
  mode = 'revoked'; await assert.rejects(helpers.apiRequest(base, token, '/notes'), error => error.status === 401 && !error.message.includes('diagnostic'));
  await assert.rejects(helpers.apiRequest(base, token, '/../users'), /Invalid/);
 } finally { server.closeAllConnections(); sink.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => sink.close(resolve))]); }
});

test('expanded attachment paths remain discoverable and oversized local files stop sync', async () => {
 const f = fixture(); await f.setup();
 try {
  const fileId = '64b000000000000000000009', bytes = Buffer.from('file');
  f.state.files = [{ id: fileId, name: 'x.txt', mime: 'text/plain', bytes: bytes.length, hash: digest(bytes) }]; f.state.data.set(fileId, bytes);
  f.state.remote.content = '![[x.txt]]\n'.repeat(22000); f.state.remote.attachmentRevision++;
  let [row] = await f.plugin.plan(); await f.plugin.apply(row, 'download'); const file = f.vault.getMarkdownFiles()[0];
  assert.ok(file.stat.size > 1024 * 1024 + 32768); assert.equal((await f.plugin.plan())[0].action, 'unchanged');
  const assets = [{ id: fileId, name: 'x.txt', hash: digest(bytes), path: 'Study/' + 'x'.repeat(590) }];
  assert.throws(() => helpers.localText(f.state.remote, apiOrigin, owner, assets), /exceeds 4 MiB/);
  file.stat.size = 4 * 1024 * 1024 + 1; await assert.rejects(f.plugin.plan(), /exceeds 4 MiB/); assert.equal(f.state.patches, 0);
 } finally { f.close(); }
});
test('failed baseline storage pauses automatic sync without discarding either copy', async () => {
 const f = fixture(); await f.setup();
 try {
  let [row] = await f.plugin.plan(); await f.plugin.apply(row, 'download'); const file = f.vault.getMarkdownFiles()[0]; file.text += '\nSaved locally';
  f.plugin.settings.automatic = true; f.app.saveLocalStorage = () => {}; await f.plugin.review(true);
  assert.equal(f.plugin.settings.automatic, false); assert.ok(file.text.includes('Saved locally')); assert.equal(f.state.patches, 0);
 } finally { f.close(); }
});

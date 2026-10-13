/* Desktop Obsidian plugin. Runtime APIs are provided by Obsidian. */
const { Plugin, PluginSettingTab, Setting, SecretComponent, Modal, Notice, TFile, TFolder } = require('obsidian');
const { createHash } = require('node:crypto');
const https = require('node:https');
const http = require('node:http');
const ID = /^[a-f0-9]{24}$/;
const isId = value => typeof value === 'string' && ID.test(value);
const STORAGE_KEY = 'thyncspace-companion-v1';
const PREFIX = 'thyncspace_sync_';
const LIMIT = 1024 * 1024;
const RAW_LIMIT = 4 * LIMIT;
const hash = value => createHash('sha256').update(value).digest('hex');
const signature = note => hash(JSON.stringify({ title: note.title, content: note.content }));
const inside = (path, folder) => path.startsWith(folder + '/');
function origin(value) {
 const url = new URL(value);
 if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '') || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Use an HTTPS API origin, or HTTP on loopback for development.');
 return url.origin;
}
function folderPath(value, maximum = 200) {
 if (typeof value !== 'string' || !value || value.length > maximum || /[\\:\p{Cc}]/u.test(value) || value.split('/').some(part => !part.trim() || part !== part.trim() || part.startsWith('.') || /[<>"|?*#^\[\]]/.test(part))) throw new Error('Choose a named vault folder without hidden or parent path segments.');
 return value;
}
const fileName = value => value.replace(/[<>:"/\\|?*#^\[\]\p{Cc}]/gu, '-').replace(/[. ]+$/g, '').slice(0, 80) || 'Document';
function validAssets(assets) {
 if (!Array.isArray(assets) || assets.length > 100) return false;
 return assets.every(asset => { try { return asset && isId(asset.id) && typeof asset.name === 'string' && asset.name.length <= 200 && !/[\p{Cc}/\\]/u.test(asset.name) && typeof asset.hash === 'string' && /^[a-f0-9]{64}$/.test(asset.hash) && typeof asset.path === 'string' && asset.path.length <= 600 && folderPath(asset.path, 600); } catch { return false; } });
}
function mapAssets(content, assets, reverse) {
 const paths = new Map(), ambiguous = new Set();
 for (const asset of assets) { const key = reverse ? asset.path : asset.name; if (paths.has(key)) ambiguous.add(key); else paths.set(key, reverse ? asset.name : asset.path); }
 const map = (target, markdown) => {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) return target;
  let decoded = target; try { decoded = decodeURIComponent(target); } catch { return target; }
  if (ambiguous.has(decoded) || !paths.has(decoded)) return target;
  const value = paths.get(decoded); return markdown ? value.split('/').map(encodeURIComponent).join('/') : value;
 };
 let fence = '', width = 0, bytes = Buffer.byteLength(content);
 const bounded = (original, replacement) => { bytes += Buffer.byteLength(replacement) - Buffer.byteLength(original); if (bytes > RAW_LIMIT) throw new Error('Mapped local Markdown exceeds 4 MiB. Use shorter attachment paths or a smaller document.'); return replacement; };
 return content.split('\n').map(line => {
  const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  if (marker) { if (!fence) { fence = marker[1][0]; width = marker[1].length; } else if (marker[1][0] === fence && marker[1].length >= width && !line.slice(marker[0].length).trim()) fence = ''; return line; }
  if (fence) return line;
  return line.replace(/(`+)[\s\S]*?\1|(!?)\[\[([^\]\n]+)\]\]|(!?\[[^\]\n]*\]\()(<[^>]+>|[^\s)]+)([^)]*\))/g, (whole, code, embed, wiki, prefix, target, suffix) => {
   if (code) return whole;
   if (wiki !== undefined) { const [name, ...label] = wiki.split('|'); return bounded(whole, embed + '[[' + map(name, false) + (label.length ? '|' + label.join('|') : '') + ']]'); }
   const angled = target.startsWith('<'), original = angled ? target.slice(1, -1) : target, mapped = map(original, true);
   return mapped === original ? whole : bounded(whole, prefix + (angled ? '<' + mapped + '>' : mapped) + suffix);
  });
 }).join('\n');
}
function frontmatter(text) {
 const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/.exec(text);
 return match ? { lines: match[1].split(/\r?\n/), body: text.slice(match[0].length), had: true } : { lines: [], body: text, had: false };
}
function localText(note, apiOrigin, owner, assets = []) {
 const fm = frontmatter(note.content);
 if (fm.lines.some(line => line.startsWith(PREFIX))) throw new Error('The source already uses reserved thyncspace_sync_ frontmatter. Rename those properties before connecting it.');
 const fields = { id: note.id, origin: apiOrigin, owner, title: note.title, frontmatter: fm.had, files: assets };
 const result = '---\n' + Object.entries(fields).map(([name, value]) => PREFIX + name + ': ' + JSON.stringify(value)).concat(fm.lines).join('\n') + '\n---\n' + mapAssets(fm.body, assets, false);
 if (Buffer.byteLength(result) > RAW_LIMIT) throw new Error('Mapped local Markdown exceeds 4 MiB. Use shorter attachment paths or a smaller document.');
 return result;
}
function readLocal(text) {
 if (Buffer.byteLength(text) > RAW_LIMIT) throw new Error('The mapped local document exceeds the 4 MiB limit.');
 const fm = frontmatter(text), metadata = Object.create(null), remaining = [];
 for (const line of fm.lines) {
  if (!line.startsWith(PREFIX)) { remaining.push(line); continue; }
  const match = /^thyncspace_sync_(id|origin|owner|title|frontmatter|files): (.+)$/.exec(line);
  if (!match || Object.hasOwn(metadata, match[1])) throw new Error('The sync frontmatter is damaged or duplicated. Keep a copy before repairing it.');
  metadata[match[1]] = JSON.parse(match[2]);
 }
 if (!Object.keys(metadata).length) return null;
 if (!isId(metadata.id) || !isId(metadata.owner) || typeof metadata.origin !== 'string' || origin(metadata.origin) !== metadata.origin || typeof metadata.title !== 'string' || !metadata.title.trim() || metadata.title.length > 200 || typeof metadata.frontmatter !== 'boolean' || !validAssets(metadata.files)) throw new Error('The sync frontmatter is invalid.');
 const body = mapAssets(fm.body, metadata.files, true);
 const content = metadata.frontmatter || remaining.some(line => line.trim()) ? '---\n' + remaining.join('\n') + '\n---\n' + body : body;
 if (Buffer.byteLength(content) > LIMIT) throw new Error('The local document exceeds the 1 MiB sync limit.');
 return { id: metadata.id, origin: metadata.origin, owner: metadata.owner, title: metadata.title, content, assets: metadata.files };
}
function remoteNote(value, id) {
 if (!value || value.id !== id || !isId(id) || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200 || typeof value.content !== 'string' || Buffer.byteLength(value.content) > LIMIT || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.attachmentRevision) || value.attachmentRevision < 0) throw new Error('The server returned an invalid document.');
 return value;
}
function decision(local, remote, base) {
 if (!local) return base ? 'missing' : 'download';
 if (signature(local) === signature(remote)) return base?.local === signature(local) && base?.remote === signature(remote) ? 'unchanged' : 'acknowledge';
 if (!base) return 'conflict';
 const localChanged = signature(local) !== base.local, remoteChanged = signature(remote) !== base.remote;
 return localChanged && remoteChanged ? 'conflict' : localChanged ? 'upload' : remoteChanged ? 'download' : 'unchanged';
}
function apiRequest(apiOrigin, token, path, method = 'GET', body, signal) {
 const base = origin(apiOrigin);
 if (!/^thy_obs_[A-Za-z0-9_-]{43}$/.test(token) || !/^\/(?:notes(?:\/[a-f0-9]{24}(?:\/attachments(?:\/[a-f0-9]{24})?)?)?|connection)$/.test(path)) return Promise.reject(new Error('Invalid companion request.'));
 const url = new URL('/api/companion' + path, base), input = body === undefined ? undefined : JSON.stringify(body);
 if (input && Buffer.byteLength(input) > 4 * LIMIT) return Promise.reject(new Error('The document request is too large.'));
 return new Promise((resolve, reject) => {
  let settled = false;
  const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
  const request = (url.protocol === 'https:' ? https : http).request(url, { method, signal, headers: { Authorization: 'Bearer ' + token, ...(input ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input) } : {}) } }, response => {
   // Never follow redirects with a connection token.
   const chunks = []; let bytes = 0;
   response.on('data', chunk => { bytes += chunk.length; if (bytes > 4 * LIMIT) { response.destroy(); finish(new Error('The server response exceeds the sync limit.')); } else chunks.push(chunk); });
   response.on('error', () => finish(new Error('The connection ended before the response completed.')));
   response.on('end', () => {
    const status = response.statusCode ?? 0;
    if (status < 200 || status >= 300) { const error = new Error(status === 409 ? 'The server copy changed. Review both copies again.' : status === 401 ? 'The connection expired or was revoked. Reconnect in ThyncSpace.' : status === 404 ? 'This document is unavailable or no longer private.' : status === 429 ? 'Sync is rate limited. Wait before trying again.' : 'The server rejected this sync request (' + status + ').'); error.status = status; finish(error); return; }
    const data = Buffer.concat(chunks); if (status === 204) { finish(null, null); return; }
    if (String(response.headers['content-type'] ?? '').includes('application/json')) { try { finish(null, JSON.parse(data.toString('utf8'))); } catch { finish(new Error('The server response was not valid JSON.')); } } else finish(null, data);
   });
  });
  const timer = setTimeout(() => { request.destroy(); finish(new Error('Sync timed out. Local files were kept; review again before retrying.')); }, 30000);
  request.on('error', () => finish(new Error('Could not reach the configured ThyncSpace API.')));
  if (input) request.write(input); request.end();
 });
}
const DEFAULTS = { apiOrigin: '', folder: 'ThyncSpace', secretRef: '', owner: '', selected: [], automatic: false, records: [] };
class ThyncSpaceCompanion extends Plugin {
 async onload() {
  // Baselines and settings stay on this device, separate from vault file sync.
  const stored = this.app.loadLocalStorage(STORAGE_KEY); this.settings = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (!Array.isArray(this.settings.selected) || this.settings.selected.length > 50 || !this.settings.selected.every(id => typeof id === 'string' && isId(id))) this.settings.selected = [];
  if (!Array.isArray(this.settings.records) || this.settings.records.length > 100) this.settings.records = [];
  const previousCount = this.settings.records.length;
  this.settings.records = this.settings.records.filter(row => row && isId(row.id) && typeof row.origin === 'string' && isId(row.owner) && typeof row.local === 'string' && /^[a-f0-9]{64}$/.test(row.local) && typeof row.remote === 'string' && /^[a-f0-9]{64}$/.test(row.remote) && Number.isSafeInteger(row.revision) && row.revision >= 0 && Number.isSafeInteger(row.filesRevision) && row.filesRevision >= 0 && typeof row.path === 'string' && row.path.length <= 600 && validAssets(row.assets));
  if (this.settings.records.length !== previousCount) { this.settings.automatic = false; new Notice('Some device sync history was invalid. Review the selected documents before enabling automatic sync.'); }
  this.settings.automatic = this.settings.automatic === true;
  for (const key of ['apiOrigin', 'folder', 'secretRef', 'owner']) if (typeof this.settings[key] !== 'string') this.settings[key] = DEFAULTS[key];
  this.busy = false; this.disposed = false; this.documents = []; this.pendingRequests = new Set();
  this.addSettingTab(new CompanionSettings(this.app, this));
  this.addCommand({ id: 'review-sync', name: 'Review selected document changes', callback: () => void this.review(false) });
  this.addCommand({ id: 'disconnect', name: 'Disconnect and keep files', callback: () => void this.disconnect() });
  // Automatic sync is explicitly enabled in settings and never resolves conflicts.
  this.registerInterval(setInterval(() => { if (this.settings.automatic) void this.review(true); }, 300000));
 }
 onunload() { this.disposed = true; this.settings.automatic = false; for (const request of this.pendingRequests) request.abort(); }
 async saveSettings() {
  if (this.disposed) throw new Error('The companion stopped before its progress could be saved.');
  this.app.saveLocalStorage(STORAGE_KEY, this.settings);
  if (JSON.stringify(this.app.loadLocalStorage(STORAGE_KEY)) !== JSON.stringify(this.settings)) throw new Error('Sync progress could not be saved on this device. Automatic sync is paused.');
 }
 async request(path, method, body) {
  if (this.disposed) throw new Error('The companion is no longer running.');
  const token = this.app.secretStorage?.getSecret(this.settings.secretRef);
  if (!token) throw new Error('Choose a companion token from Obsidian Secret Storage.');
  const request = new AbortController(); this.pendingRequests.add(request);
  try { const value = await apiRequest(this.settings.apiOrigin, token, path, method, body, request.signal); if (this.disposed) throw new Error('The companion stopped.'); return value; } finally { this.pendingRequests.delete(request); }
 }
 async connect() {
  const value = await this.request('/notes');
  if (!value || !isId(value.owner) || !isId(value.connectionId) || !Array.isArray(value.notes) || value.notes.length > 50 || typeof value.attachments !== 'boolean' || value.notes.some(note => !note || !isId(note.id) || typeof note.available !== 'boolean' || (note.available && (typeof note.title !== 'string' || note.title.length > 200)))) throw new Error('The server returned an invalid connection scope.');
  if (this.settings.owner && this.settings.owner !== value.owner) { this.settings.selected = []; this.settings.automatic = false; }
  this.settings.owner = value.owner; this.documents = value.notes; this.includesFiles = value.attachments;
  this.settings.selected = this.settings.selected.filter(id => value.notes.some(note => note.id === id)); await this.saveSettings(); return value;
 }
 async ensureFolder(path) {
  folderPath(path, 600); let current = '';
  for (const part of path.split('/')) { current = current ? current + '/' + part : part; const entry = this.app.vault.getAbstractFileByPath(current); if (entry && !(entry instanceof TFolder)) throw new Error('A file occupies the chosen sync folder.'); if (!entry) await this.app.vault.createFolder(current); }
 }
 openEditors(path) { return this.app.workspace.getLeavesOfType("markdown").filter(leaf => leaf.view?.file?.path === path); }
 async localFiles() {
  const folder = folderPath(this.settings.folder), files = this.app.vault.getMarkdownFiles().filter(file => inside(file.path, folder));
  if (files.length > 1000) throw new Error('Choose a sync folder with at most 1,000 Markdown files.');
  const mapped = new Map();
  for (const file of files) {
   if (file.stat.size > RAW_LIMIT) throw new Error('A Markdown file in this folder exceeds 4 MiB. Move it outside the selected folder before syncing.');
   const raw = await this.app.vault.read(file), value = readLocal(raw);
   if (!value || value.origin !== origin(this.settings.apiOrigin) || value.owner !== this.settings.owner || !this.settings.selected.includes(value.id)) continue;
   if (this.openEditors(file.path).some(leaf => leaf.view.editor && leaf.view.editor.getValue() !== raw)) throw new Error("An open document has pending editor changes. Wait for Obsidian to save, then review again.");
   if (mapped.has(value.id)) throw new Error('Two local files contain the same ThyncSpace note ID. Review their frontmatter before syncing.');
   mapped.set(value.id, { file, raw, ...value });
  }
  return mapped;
 }
 base(id) { return this.settings.records.find(row => row.id === id && row.origin === this.settings.apiOrigin && row.owner === this.settings.owner); }
 async plan() {
  await this.connect(); folderPath(this.settings.folder);
  if (!this.settings.selected.length) throw new Error('Select documents in the companion settings first.');
  const local = await this.localFiles(), rows = [];
  for (const id of this.settings.selected) {
   const available = this.documents.find(note => note.id === id);
   if (!available?.available) { rows.push({ id, action: 'unavailable', local: local.get(id), message: 'The server copy is unavailable or shared. Its local file will be kept.' }); continue; }
   const remote = remoteNote(await this.request('/notes/' + id), id), previous = local.get(id), base = this.base(id);
   let action = decision(previous, remote, base);
   if (this.includesFiles && previous && ['unchanged', 'acknowledge'].includes(action) && (base?.filesRevision !== remote.attachmentRevision || previous.assets.some(asset => !inside(asset.path, this.settings.folder) || !(this.app.vault.getAbstractFileByPath(asset.path) instanceof TFile)))) action = 'files';
   if (["download", "files"].includes(action) && previous && this.openEditors(previous.file.path).length) { rows.push({ id, action: "open", local: previous, remote, message: "Close this local document tab, then review again to download server changes." }); continue; }
   rows.push({ id, action, local: previous, remote, base, origin: this.settings.apiOrigin, owner: this.settings.owner, folder: this.settings.folder });
  }
  return rows;
 }
 async review(automatic) {
  if (this.busy || this.disposed) return; this.busy = true;
  try {
   const rows = await this.plan();
   if (this.disposed) return;
   if (!automatic) { this.busy = false; new SyncReview(this.app, this, rows).open(); return; }
   const safe = rows.filter(row => row.action === 'acknowledge' || (row.base && row.local && ['upload', 'download', 'files'].includes(row.action)));
   for (const row of safe) { if (this.disposed || !this.settings.automatic) break; await this.apply(row, row.action); }
   if (rows.some(row => ['conflict', 'missing', 'unavailable', 'open'].includes(row.action) || (!row.base && row.action === 'download'))) new Notice('ThyncSpace needs a sync review. Conflicting and missing files were kept.');
  } catch (error) { this.settings.automatic = false; await this.saveSettings().catch(() => undefined); new Notice(error.message || 'ThyncSpace sync failed. Local files were kept.'); }
  finally { this.busy = false; }
 }
 async downloadAttachments(id) {
  if (!this.includesFiles) return [];
  const files = await this.request('/notes/' + id + '/attachments');
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/plain': 'txt' };
  if (!Array.isArray(files) || files.length > 100 || files.some(file => !file || !isId(file.id) || !/^[a-f0-9]{64}$/.test(file.hash) || typeof file.name !== 'string' || file.name.length > 200 || !extensions[file.mime] || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > 2 * LIMIT) || files.reduce((total, file) => total + file.bytes, 0) > 50 * LIMIT) throw new Error('The server returned invalid linked file metadata.');
  const directory = folderPath(this.settings.folder) + '/Attachments'; if (files.length) await this.ensureFolder(directory);
  const mapped = [];
  for (const file of files) {
   const path = directory + '/' + file.id + '-' + file.hash.slice(0, 12) + '-' + fileName(file.name.replace(/\.[^.]+$/, '')) + '.' + extensions[file.mime], existing = this.app.vault.getAbstractFileByPath(path);
   if (existing) {
    if (!(existing instanceof TFile) || hash(Buffer.from(await this.app.vault.readBinary(existing))) !== file.hash) throw new Error('A mapped attachment was edited locally. Move or rename that copy before downloading the server file.');
   } else {
    const bytes = await this.request('/notes/' + id + '/attachments/' + file.id);
    if (!Buffer.isBuffer(bytes) || bytes.length !== file.bytes || hash(bytes) !== file.hash) throw new Error('A linked file changed during download. Review again.');
    if (this.disposed) throw new Error('The companion stopped.');
    await this.app.vault.createBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
   }
   mapped.push({ id: file.id, name: file.name, hash: file.hash, path });
  }
  return mapped;
 }
 async remember(row, local, remote, path, assets = [], filesRevision = remote.attachmentRevision) {
  const record = { id: row.id, owner: this.settings.owner, origin: this.settings.apiOrigin, local: signature(local), remote: signature(remote), revision: remote.revision, filesRevision, path, assets };
  this.settings.records = this.settings.records.filter(item => !(item.id === row.id && item.owner === record.owner && item.origin === record.origin));
  this.settings.records.push(record); this.settings.records = this.settings.records.slice(-100); await this.saveSettings();
 }
 async apply(row, action) {
  if (this.disposed) throw new Error('The companion stopped.');
  if (row.origin !== this.settings.apiOrigin || row.owner !== this.settings.owner || row.folder !== this.settings.folder) throw new Error('The connection or folder changed. Review again.');
  if (!this.settings.selected.includes(row.id) || !row.remote || !['upload', 'download', 'acknowledge', 'files'].includes(action)) throw new Error('Select and review this document again.');
  if (row.local && (!inside(row.local.file.path, folderPath(this.settings.folder)) || await this.app.vault.read(row.local.file) !== row.local.raw)) throw new Error('The local file changed after preview. Review both copies again.');
  const latest = remoteNote(await this.request('/notes/' + row.id), row.id);
  if (latest.revision !== row.remote.revision || signature(latest) !== signature(row.remote) || latest.attachmentRevision !== row.remote.attachmentRevision) throw new Error('The server changed after preview. Review both copies again.');
  if (action === 'upload') {
   if (!row.local) throw new Error('There is no local file to upload.');
   const saved = remoteNote(await this.request('/notes/' + row.id, 'PATCH', { title: row.local.title, content: row.local.content, expectedRevision: row.remote.revision }), row.id);
   await this.remember(row, row.local, saved, row.local.file.path, row.local.assets ?? row.base?.assets ?? [], row.base?.filesRevision ?? 0);
  } else if (action === 'download' || action === 'files') {
   if (row.local && this.openEditors(row.local.file.path).length) throw new Error('Close the local document tab before downloading a server replacement.');
   const assets = await this.downloadAttachments(row.id), raw = localText(action === 'files' ? row.local : row.remote, origin(this.settings.apiOrigin), this.settings.owner, assets);
   if (this.disposed) throw new Error('The companion stopped.');
   let file = row.local?.file;
   if (file) {
    if (!inside(file.path, folderPath(this.settings.folder))) throw new Error('The local file moved outside the selected folder.');
    await this.app.vault.process(file, current => { if (this.disposed || this.openEditors(file.path).length) throw new Error("The document opened or sync stopped. Close the tab and review again."); if (current !== row.local.raw) throw new Error('The local file changed during download. Review it again.'); return raw; });
   } else {
    await this.ensureFolder(folderPath(this.settings.folder));
    if (this.disposed) throw new Error('The companion stopped.');
    file = await this.app.vault.create(this.settings.folder + '/' + fileName(row.remote.title) + ' (' + row.id.slice(-6) + ').md', raw);
   }
   await this.remember(row, readLocal(raw), row.remote, file.path, assets);
  } else await this.remember(row, row.local, row.remote, row.local.file.path, row.local.assets ?? [], row.base?.filesRevision ?? 0);
 }
 async disconnect() {
  if (this.busy) { new Notice('Wait for the current sync action to finish.'); return; }
  this.busy = true; let revoked = false;
  try { await this.request('/connection', 'DELETE'); revoked = true; } catch (error) { if (error.status === 401) revoked = true; }
  this.settings.automatic = false; this.settings.secretRef = ''; this.settings.selected = []; this.documents = [];
  try { await this.saveSettings(); new Notice(revoked ? 'Disconnected. Local documents and attachments were kept.' : 'Stopped locally. Revoke this connection in ThyncSpace when online. Local files were kept.'); }
  catch { new Notice('Could not save the disconnect. Disable this plugin and revoke its connection in ThyncSpace.'); }
  finally { this.busy = false; }
 }
}
class SyncReview extends Modal {
 constructor(app, plugin, rows) { super(app); this.plugin = plugin; this.rows = rows; this.running = false; }
 onOpen() {
  this.modalEl.style.width = 'min(1000px, 95vw)'; this.contentEl.style.maxHeight = '80vh'; this.contentEl.style.overflowY = 'auto';
  this.contentEl.createEl('h2', { text: 'Review ThyncSpace changes' });
  this.contentEl.createEl('p', { text: 'Only selected private documents can sync. No deletion is propagated. Review both copies when they differ.' });
  for (const row of this.rows) {
   const section = this.contentEl.createEl('section'); section.style.marginBottom = '24px';
   section.createEl('h3', { text: row.remote?.title ?? row.local?.title ?? row.id }); section.createEl('p', { text: row.message ?? row.action });
   if (['unchanged', 'unavailable', 'open'].includes(row.action)) continue;
   if (row.local) { const details = section.createEl('details'); details.createEl('summary', { text: 'Local copy' }); const field = details.createEl('textarea', { attr: { readonly: '', rows: '8', 'aria-label': 'Local copy' } }); field.value = row.local.content; field.style.width = '100%'; }
   if (row.remote) { const details = section.createEl('details'); details.createEl('summary', { text: 'Server copy' }); const field = details.createEl('textarea', { attr: { readonly: '', rows: '8', 'aria-label': 'Server copy' } }); field.value = row.remote.content; field.style.width = '100%'; }
   const choices = row.action === 'conflict' ? [['Keep local copy', 'upload'], ['Keep server copy', 'download']] : row.action === 'missing' ? [['Restore local file', 'download']] : [[row.action === 'upload' ? 'Send local changes' : row.action === 'download' ? 'Download server changes and linked files' : row.action === 'files' ? 'Download linked files' : 'Mark matching copies synced', row.action]];
   for (const [label, action] of choices) {
    const button = section.createEl('button', { text: label }); button.style.margin = '8px 8px 0 0';
    button.addEventListener('click', async () => {
     if (this.running || this.plugin.busy) return; this.running = true; this.plugin.busy = true;
     this.contentEl.querySelectorAll('button').forEach(node => { node.disabled = true; });
     try { await this.plugin.apply(row, action); section.empty(); section.createEl('p', { text: 'Synced. Local and server changes were checked again before saving.' }); }
     catch (error) { this.plugin.settings.automatic = false; await this.plugin.saveSettings().catch(() => undefined); section.createEl('p', { text: error.message || 'Sync failed. Review again.' }); }
     finally { this.running = false; this.plugin.busy = false; this.contentEl.querySelectorAll('button').forEach(node => { node.disabled = false; }); }
    });
   }
  }
 }
 onClose() { this.contentEl.empty(); }
}
class CompanionSettings extends PluginSettingTab {
 constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
 display() {
  const el = this.containerEl, plugin = this.plugin; el.empty();
  el.createEl('h2', { text: 'ThyncSpace companion' }); el.createEl('p', { text: 'Create a connection in ThyncSpace, then choose its token in Secret Storage. Select a folder in this vault and the documents to sync. Existing local files are kept when disconnected.' });
  const change = async action => { if (plugin.busy) { new Notice('Wait for the current sync action.'); return; } plugin.busy = true; try { await action(); await plugin.saveSettings(); } catch (error) { new Notice(error.message); } finally { plugin.busy = false; } };
  new Setting(el).setName('API origin').setDesc('HTTPS origin of your ThyncSpace backend, without an API path. Changing it stops automatic sync.').addText(text => text.setValue(plugin.settings.apiOrigin).onChange(value => void change(() => { plugin.settings.apiOrigin = value.trim(); plugin.settings.automatic = false; plugin.settings.selected = []; plugin.documents = []; })));
  new Setting(el).setName('Vault folder').setDesc('Only this named folder and its children are scanned. Root and hidden folders are excluded.').addText(text => text.setValue(plugin.settings.folder).onChange(value => void change(() => { plugin.settings.folder = value; plugin.settings.automatic = false; })));
  new Setting(el).setName('Connection token').setDesc('The token itself stays in Obsidian Secret Storage.').addComponent(node => new SecretComponent(this.app, node).setValue(plugin.settings.secretRef).onChange(value => void change(() => { plugin.settings.secretRef = value ?? ''; plugin.settings.automatic = false; plugin.settings.selected = []; plugin.documents = []; })));
  new Setting(el).setName('Load granted documents').addButton(button => button.setButtonText('Connect and refresh').onClick(() => void change(async () => { plugin.settings.apiOrigin = origin(plugin.settings.apiOrigin); folderPath(plugin.settings.folder); await plugin.connect(); this.display(); })));
  for (const note of plugin.documents) new Setting(el).setName(note.available ? note.title : 'Unavailable document ' + note.id).setDesc(note.id).addToggle(toggle => toggle.setValue(plugin.settings.selected.includes(note.id)).onChange(value => void change(() => { plugin.settings.selected = value ? [...new Set([...plugin.settings.selected, note.id])] : plugin.settings.selected.filter(id => id !== note.id); plugin.settings.automatic = false; })));
  new Setting(el).setName('Review sync').setDesc('Initial downloads and conflicts need review. Renaming a file keeps its identity; edit thyncspace_sync_title to change the remote title.').addButton(button => button.setButtonText('Review changes').onClick(() => void plugin.review(false)));
  new Setting(el).setName('Automatic sync every five minutes').setDesc('Previously synced documents update while Obsidian runs. Close a local document tab before receiving server replacements.').addToggle(toggle => toggle.setValue(plugin.settings.automatic === true).onChange(value => void change(() => { if (value && (!plugin.settings.selected.length || plugin.settings.selected.some(id => !plugin.base(id)))) { toggle.setValue(false); throw new Error('Review and sync each selected document once before enabling automatic sync.'); } plugin.settings.automatic = value; })));
  new Setting(el).setName('Linked files').setDesc('Downloaded files are mapped by ID and checksum below. Local file edits are preserved; upload a replacement through the ThyncSpace attachment library.');
  for (const record of plugin.settings.records.filter(row => row.origin === plugin.settings.apiOrigin && row.owner === plugin.settings.owner && plugin.settings.selected.includes(row.id))) for (const asset of (Array.isArray(record.assets) ? record.assets : []).slice(0, 100)) {
   if (typeof asset.path !== 'string' || !inside(asset.path, plugin.settings.folder) || typeof asset.name !== 'string') continue;
   new Setting(el).setName(asset.name).setDesc(asset.path).addButton(button => button.setButtonText('Open local file').onClick(() => { const file = plugin.app.vault.getAbstractFileByPath(asset.path); if (file instanceof TFile && inside(file.path, plugin.settings.folder)) void plugin.app.workspace.getLeaf(false).openFile(file); }));
  }
  new Setting(el).setName('Disconnect').setDesc('Revokes this connection when online and keeps all local files.').addButton(button => button.setButtonText('Disconnect and keep files').onClick(async () => { await plugin.disconnect(); this.display(); }));
 }
}
module.exports = ThyncSpaceCompanion;
module.exports.testing = { origin, folderPath, localText, readLocal, decision, signature, apiRequest, remoteNote };

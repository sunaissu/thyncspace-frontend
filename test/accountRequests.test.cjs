const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadApi() {
 const filename = path.resolve(__dirname, '../src/util/fetch.ts');
 const compiled = new Module(filename, module);
 compiled.filename = filename;
 compiled.require = name => {
  if (name === 'next/router') return { default: { push() { throw new Error('Unexpected redirect'); } } };
  if (name === '@/util/config') return { default: { SERVER_URL: 'https://api.example.test' } };
  throw new Error('Unexpected runtime import: ' + name);
 };
 compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
 return compiled.exports;
}

test('a security-token retry retains the account that initiated the write', async () => {
 const api = loadApi();
 const original = global.fetch, actors = [];
 api.setExpectedAccount('account-a');
 global.fetch = async (url, init) => {
  if (url.endsWith('/csrf-token')) return Response.json({ token: 'csrf' });
  actors.push(new Headers(init.headers).get('X-Account-Id'));
  if (actors.length === 1) { api.setExpectedAccount('account-b'); return Response.json({ error: 'Invalid CSRF token' }, { status: 403 }); }
  return Response.json({ error: 'The signed-in account changed' }, { status: 409 });
 };
 try {
  await assert.rejects(api.saveCapture('id', 'title', 'text'), { status: 409 });
  assert.deepEqual(actors, ['account-a', 'account-a']);
 } finally { global.fetch = original; }
});

test('collaboration requests declare protocol 1 and preserve upgrade errors', async () => {
 const api = loadApi(), original = global.fetch;
 let accepted = false;
 global.fetch = async (url, init) => {
  if (url.endsWith('/csrf-token')) return Response.json({ token: 'csrf' });
  assert.ok(url.endsWith('/collaboration-token'));
  assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(init.body), { protocol: 1 });
  if (!accepted) return Response.json({ error: 'Refresh this page before joining.' }, { status: 409 });
  return Response.json({ token: 'current-protocol-token' });
 };
 try {
  await assert.rejects(api.getCollaborationToken('note'), error => error.status === 409 && /Refresh/.test(error.message));
  accepted = true;
  assert.equal(await api.getCollaborationToken('note'), 'current-protocol-token');
 } finally { global.fetch = original; }
});

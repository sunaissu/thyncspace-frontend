const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
function load(name) {
  const filename = path.resolve(__dirname, "../src/util", name + ".ts");
  const compiled = new Module(filename, module);
  compiled.filename = filename; compiled.paths = module.paths;
  compiled.require = dependency => dependency === "./presence" ? load("presence") : require(dependency);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return compiled.exports;
}
const { reconcileCollaborationPeers } = load("collaborationPeers");
const states = () => Array.from({ length: 24 }, (_, clientId) => ({
  clientId, user: { id: `user-${clientId}`, name: `Person ${clientId}`, color: "#2563eb" },
  caret: { surface: "visual", block: 2, offset: 10 }, cursor: { surface: "visual", block: 2, x: 0.5, y: 20 },
}));
test("sustained local typing and repeated awareness snapshots reuse the same roster", () => {
  const current = states();
  const original = reconcileCollaborationPeers([], current, 0);
  let peers = original;
  for (let offset = 0; offset < 500; offset++) {
    current[0].caret = { surface: "visual", block: 4 + offset, offset };
    current[0].cursor.x = offset / 500;
    peers = reconcileCollaborationPeers(peers, structuredClone(current), 0);
    assert.equal(peers, original);
  }
  assert.equal(reconcileCollaborationPeers(peers, [...current].reverse(), 0), original);
});
test("remote movement updates its exact endpoint while retaining unaffected peers", () => {
  const current = states(), before = reconcileCollaborationPeers([], current, 0);
  current[4].caret = { surface: "visual", block: 8, offset: 123 };
  const next = reconcileCollaborationPeers(before, current, 0);
  assert.notEqual(next, before);
  assert.deepEqual(next[4].caret, current[4].caret);
  for (let index = 0; index < next.length; index++) assert.equal(next[index] === before[index], index !== 4);
  current[4].caret = null;
  assert.equal(reconcileCollaborationPeers(next, current, 0)[4].caret, null);
});
test("joins, departures, account changes and editing mode changes remain visible", () => {
  const current = states(), before = reconcileCollaborationPeers([], current, 0);
  current[0].caret.surface = "markdown"; current[0].caret.block = 0;
  current[2].user.name = "Renamed";
  current.splice(3, 1);
  current.push({ clientId: 30, user: { id: "another-session", name: "Joined", color: "invalid" } });
  const next = reconcileCollaborationPeers(before, current, 0);
  assert.equal(next.find(peer => peer.sessionId === 0).caret.surface, "markdown");
  assert.equal(next.find(peer => peer.sessionId === 2).name, "Renamed");
  assert.equal(next.some(peer => peer.sessionId === 3), false);
  assert.equal(next.find(peer => peer.sessionId === 30).color, "#2563eb");
  assert.deepEqual(reconcileCollaborationPeers(next, [], 0), []);
});
test("malformed presence cannot create invalid endpoints or invalid identities", () => {
  const result = reconcileCollaborationPeers([], [
    { clientId: 1, user: { id: "one", name: "One" }, caret: { surface: "visual", block: 0, offset: Infinity } },
    { clientId: 2, user: { id: {}, name: "Bad id" } },
    { clientId: NaN, user: { id: "bad-session", name: "Bad session" } },
  ], 0);
  assert.equal(result.length, 1); assert.equal(result[0].caret, null);
});

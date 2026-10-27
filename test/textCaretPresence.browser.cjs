// Run with: node --test test/textCaretPresence.browser.cjs
const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("@playwright/test");
const { transformSync } = require("esbuild");
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined) });
});
after(async () => { await browser?.close(); });
const source = transformSync(fs.readFileSync(path.resolve(__dirname, "../src/util/textCaretPresence.ts"), "utf8"), { loader: "ts", format: "iife", globalName: "carets" }).code;
async function fixture(body, run) {
  const page = await browser.newPage();
  try {
    await page.setContent(`<style>body{margin:20px;font:20px/28px monospace}.editor{width:320px;border:1px solid;padding:10px;white-space:pre-wrap}p{margin:12px 0}textarea{font:20px/28px monospace;box-sizing:border-box;width:240px;height:120px;padding:8px;border:2px solid;tab-size:4}</style>${body}`);
    await page.addScriptTag({ content: source });
    return await page.evaluate(run);
  } finally { await page.close(); }
}
test("formatted text uses the active selection endpoint and does not change selection, content, or focus", async () => {
  const result = await fixture('<div id="root"><div class="editor" contenteditable="true"><p>Hello <strong>bold 😀 text</strong><em> end</em></p></div></div>', () => {
    const root = document.querySelector("#root"), editor = root.firstElementChild, text = editor.querySelector("strong").firstChild;
    editor.focus();
    const selection = getSelection(); selection.setBaseAndExtent(text, 10, text, 7);
    const before = { html: root.innerHTML, anchor: selection.anchorOffset, focus: selection.focusOffset, active: document.activeElement };
    const caret = carets.captureTextCaret(root), rect = carets.getTextCaretRect(root, caret);
    const range = document.createRange(); range.setStart(text, 7); range.collapse(true);
    const expected = range.getBoundingClientRect();
    return { caret, delta: [rect.left - expected.left, rect.top - expected.top], intact: root.innerHTML === before.html && selection.anchorOffset === before.anchor && selection.focusOffset === before.focus && document.activeElement === before.active };
  });
  assert.deepEqual(result.caret, { surface: "visual", block: 0, offset: 13 });
  assert.deepEqual(result.delta, [0, 0]); assert.equal(result.intact, true);
});
test("visual positions resolve in the receiver's wrapping, independent of sender width", async () => {
  const result = await fixture('<div id="a"><div class="editor" contenteditable="true"><p></p></div></div><div id="b"><div class="editor" style="width:580px" contenteditable="true"><p></p></div></div>', () => {
    const a = document.querySelector("#a"), b = document.querySelector("#b"), text = "Long shared paragraph with words that wrap into different lines in each collaborator window. ".repeat(4);
    a.querySelector("p").textContent = b.querySelector("p").textContent = text;
    a.firstElementChild.focus(); getSelection().setPosition(a.querySelector("p").firstChild, 132);
    const caret = carets.captureTextCaret(a), before = getSelection().focusNode;
    const rect = carets.getTextCaretRect(b, caret), range = document.createRange();
    range.setStart(b.querySelector("p").firstChild, 132); range.collapse(true);
    const expected = range.getBoundingClientRect();
    return { delta: [rect.left - expected.left, rect.top - expected.top], selectionUnchanged: getSelection().focusNode === before };
  });
  assert.deepEqual(result.delta, [0, 0]); assert.equal(result.selectionUnchanged, true);
});
test("nested lists normalize renderer indentation and preserve a caret after a hard line break", async () => {
  const result = await fixture('<div id="a"><div class="editor" contenteditable="true"><ul><li>one</li><li>two<br>three</li></ul></div></div><div id="b"><div class="editor" contenteditable="true"><ul>\n<li>one</li>\n<li>two<br>\nthree</li>\n</ul></div></div>', () => {
    const a = document.querySelector("#a"), b = document.querySelector("#b");
    a.firstElementChild.focus(); getSelection().setPosition(a.querySelectorAll("li")[1].lastChild, 2);
    const caret = carets.captureTextCaret(a), rect = carets.getTextCaretRect(b, caret), range = document.createRange();
    range.setStart(b.querySelectorAll("li")[1].lastChild, 3); range.collapse(true);
    const expected = range.getBoundingClientRect();
    return { caret, delta: [rect.left - expected.left, rect.top - expected.top] };
  });
  assert.deepEqual(result.caret, { surface: "visual", block: 0, offset: 10 });
  assert.deepEqual(result.delta, [0, 0]);
});
test("an unpublished empty paragraph gets an approximate marker without changing either editor", async () => {
  const result = await fixture('<div id="a"><div class="editor" contenteditable="true"><p>shared</p><p><br></p></div></div><div id="b"><div class="editor" contenteditable="true"><p>shared</p></div></div>', () => {
    const a = document.querySelector("#a"), b = document.querySelector("#b");
    a.firstElementChild.focus(); getSelection().setPosition(a.querySelectorAll("p")[1], 0);
    const before = document.body.innerHTML, selection = getSelection().focusNode;
    const caret = carets.captureTextCaret(a), remote = carets.getTextCaretRect(b, caret), local = carets.getTextCaretRect(a, caret);
    return { caret, approximate: remote.approximate, remoteBelow: remote.top >= b.querySelector("p").getBoundingClientRect().bottom, localApproximate: local.approximate, intact: document.body.innerHTML === before && getSelection().focusNode === selection };
  });
  assert.deepEqual(result.caret, { surface: "visual", block: 1, offset: 0, empty: true });
  assert.equal(result.approximate, true); assert.equal(result.remoteBelow, true); assert.equal(result.localApproximate, false); assert.equal(result.intact, true);
});
test("Markdown carets account for backward selections, wrapping, tabs and textarea scrolling", async () => {
  const result = await fixture('<div id="root"><textarea class="sunaissu-markdown-source"></textarea><button>Other control</button></div>', () => {
    const root = document.querySelector("#root"), textarea = root.querySelector("textarea");
    textarea.value = ("first\tsecond a long wrapped line\n").repeat(12);
    textarea.focus(); textarea.setSelectionRange(100, 120, "backward");
    textarea.scrollTop = 0;
    const before = { html: root.innerHTML, value: textarea.value, start: textarea.selectionStart, end: textarea.selectionEnd, direction: textarea.selectionDirection };
    const caret = carets.captureTextCaret(root), first = carets.getTextCaretRect(root, caret);
    textarea.scrollTop = 56;
    const second = carets.getTextCaretRect(root, caret);
    const intact = root.innerHTML === before.html && textarea.value === before.value && textarea.selectionStart === before.start && textarea.selectionEnd === before.end && textarea.selectionDirection === before.direction && document.activeElement === textarea;
    root.querySelector("button").focus();
    return { caret, scrollDelta: second.top - first.top, expectedDelta: -textarea.scrollTop, intact, cleared: carets.captureTextCaret(root) === null, mirrorCount: document.body.children.length };
  });
  assert.deepEqual(result.caret, { surface: "markdown", block: 0, offset: 100 });
  assert.equal(result.scrollDelta, result.expectedDelta); assert.equal(result.intact, true); assert.equal(result.cleared, true);
});
test("leaving visual focus clears presence and read-only viewers can still resolve a peer's position", async () => {
  const result = await fixture('<div id="root"><div class="editor sunaissu-rich-text-editor" contenteditable="true"><p>readable text</p></div><button>Other control</button></div>', () => {
    const root = document.querySelector("#root"), editor = root.firstElementChild;
    editor.focus(); getSelection().setPosition(editor.querySelector("p").firstChild, 4);
    const caret = carets.captureTextCaret(root);
    root.querySelector("button").focus();
    const cleared = carets.captureTextCaret(root) === null;
    editor.contentEditable = "false";
    return { cleared, resolved: !!carets.getTextCaretRect(root, caret), stayedFocused: document.activeElement === root.querySelector("button") };
  });
  assert.equal(result.cleared, true); assert.equal(result.resolved, true); assert.equal(result.stayedFocused, true);
});
test("24 Markdown peers share one mirror while retaining the same measured positions", async () => {
  const result = await fixture('<div id="root"><textarea class="sunaissu-markdown-source"></textarea></div>', () => {
    const root = document.querySelector("#root"), textarea = root.firstElementChild;
    textarea.value = "A long line with tabs\tand wrapped words.\n".repeat(80);
    textarea.focus(); textarea.setSelectionRange(4, 8, "backward");
    const positions = Array.from({ length: 24 }, (_, index) => ({ surface: "markdown", block: 0, offset: index * 13 }));
    const originalAppend = document.body.appendChild;
    let mirrors = 0;
    document.body.appendChild = function (node) { if (node.getAttribute?.("aria-hidden") === "true") mirrors++; return originalAppend.call(this, node); };
    const toCoordinates = rect => [rect.left, rect.top, rect.height, rect.approximate];
    try {
      const individual = positions.map(position => carets.getTextCaretRect(root, position)).map(toCoordinates);
      const individualMirrors = mirrors; mirrors = 0;
      const batch = carets.getTextCaretRects(root, positions).map(toCoordinates);
      return { individual, batch, individualMirrors, batchMirrors: mirrors, selection: [textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection], mirrorsRemaining: document.querySelectorAll('[aria-hidden="true"]').length };
    } finally { document.body.appendChild = originalAppend; }
  });
  assert.deepEqual(result.batch, result.individual);
  assert.equal(result.individualMirrors, 24); assert.equal(result.batchMirrors, 1);
  assert.deepEqual(result.selection, [4, 8, "backward"]); assert.equal(result.mirrorsRemaining, 0);
});
test("24 visual peers share their block projection and repeated endpoints share one Range measurement", async () => {
  const result = await fixture('<div id="root"><div class="editor" contenteditable="true"><p></p></div></div>', () => {
    const root = document.querySelector("#root"), paragraph = root.querySelector("p");
    paragraph.innerHTML = "<strong>formatted </strong><em>paragraph </em>".repeat(60);
    const childNodes = Object.getOwnPropertyDescriptor(Node.prototype, "childNodes").get;
    let traversals = 0;
    Object.defineProperty(paragraph, "childNodes", { configurable: true, get() { traversals++; return childNodes.call(this); } });
    const positions = Array.from({ length: 24 }, (_, index) => ({ surface: "visual", block: 0, offset: index * 9 }));
    const toCoordinates = rect => [rect.left, rect.top, rect.height, rect.approximate];
    const individual = positions.map(position => carets.getTextCaretRect(root, position)).map(toCoordinates);
    const individualTraversals = traversals; traversals = 0;
    const batch = carets.getTextCaretRects(root, positions).map(toCoordinates);
    const batchTraversals = traversals;
    let ranges = 0;
    const originalRange = document.createRange;
    document.createRange = function () { ranges++; return originalRange.call(this); };
    try {
      carets.getTextCaretRects(root, Array(24).fill(positions[1]));
      return { individual, batch, individualTraversals, batchTraversals, duplicateRanges: ranges };
    } finally { document.createRange = originalRange; delete paragraph.childNodes; }
  });
  assert.deepEqual(result.batch, result.individual);
  assert.equal(result.individualTraversals, 24); assert.equal(result.batchTraversals, 1);
  assert.equal(result.duplicateRanges, 1);
});

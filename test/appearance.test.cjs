const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/util/appearance.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { DEFAULT_APPEARANCE, SCHEME_COLORS, normalizeAppearance, readAppearance, getPackageBrandColors, getPackageScrollbar, contrastText } = compiled.exports;

function initializeAppearance(storage, { systemDark = true, unavailable = false } = {}) {
  const properties = {}, dataset = {}, meta = {};
  const style = { setProperty(name, value) { properties[name] = value; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../public/theme-init.js'), 'utf8'), {
    document: {
      documentElement: { dataset, style },
      querySelector() { return { setAttribute(name, value) { meta[name] = value; } }; },
    },
    window: { matchMedia() { return { matches: systemDark }; } },
    localStorage: { getItem(key) { if (unavailable) throw new Error('Storage blocked'); return storage[key] ?? null; } },
  });
  return { properties, dataset, style, meta };
}

test('missing appearance preferences preserve the existing accent and native scrollbars', () => {
  const accent = { primary: '#6d28d9', secondary: '#27272a' };
  const appearance = readAppearance(null);
  assert.deepEqual(appearance, DEFAULT_APPEARANCE);
  assert.equal(getPackageBrandColors(appearance, accent), accent);
  assert.equal(getPackageScrollbar(appearance.scrollbar), undefined);
  const initial = initializeAppearance({ 'thyncspace-theme': 'light', 'thyncspace-accent': 'violet' });
  assert.equal(initial.dataset.theme, 'light');
  assert.equal(initial.dataset.accent, 'violet');
  assert.equal(initial.dataset.colorScheme, 'default');
  assert.equal(initial.dataset.scrollbar, 'native');
  assert.equal(initial.properties['--app-scrollbar-color'], 'auto');
  assert.equal(initial.properties['--color-accent'], undefined);
});

test('persisted appearance validation rejects malformed versions, shapes, colors and boolean lookalikes', () => {
  for (const input of ['invalid json', 'null', '[]', '"custom"', '{"version":2,"colorScheme":"plum"}']) {
    assert.deepEqual(readAppearance(input), DEFAULT_APPEARANCE);
  }
  const normalized = normalizeAppearance({
    version: 1, colorScheme: '__proto__',
    customBrandColors: { primary: 'url(https://example.com)', secondary: '#AABBCC' },
    scrollbar: { mode: ['hidden'], thumbColor: '#fff', trackColor: 'var(--anything)', transparentTrack: 'false', thin: 1 },
  });
  assert.equal(normalized.colorScheme, 'default');
  assert.deepEqual(normalized.customBrandColors, { primary: '#2563eb', secondary: '#aabbcc' });
  assert.deepEqual(normalized.scrollbar, DEFAULT_APPEARANCE.scrollbar);
  assert.deepEqual(normalizeAppearance(normalized), normalized);
});

test('preset and custom colors map consistently across packages without replacing the remembered accent', () => {
  const accent = { primary: '#fb7185', secondary: '#e4e4e7' };
  for (const scheme of ['ocean', 'forest', 'plum']) {
    const appearance = normalizeAppearance({ colorScheme: scheme });
    assert.deepEqual(getPackageBrandColors(appearance, accent), SCHEME_COLORS[scheme]);
    assert.equal(getPackageBrandColors({ ...appearance, colorScheme: 'default' }, accent), accent);
  }
  const custom = normalizeAppearance({ colorScheme: 'custom', customBrandColors: { primary: '#ABCDEF', secondary: '#123456' } });
  assert.deepEqual(getPackageBrandColors(custom, accent), { primary: '#abcdef', secondary: '#123456' });
  assert.deepEqual(readAppearance(JSON.stringify(custom)), custom);
});

test('native reset removes custom colors while hidden scrolling and thin width remain distinct', () => {
  const preference = { ...DEFAULT_APPEARANCE.scrollbar, mode: 'custom', thumbColor: '#123456', trackColor: '#abcdef', transparentTrack: false, thin: true };
  assert.deepEqual(getPackageScrollbar(preference), { thumbColor: '#123456', trackColor: '#abcdef', width: 'thin' });
  assert.equal(getPackageScrollbar({ ...preference, transparentTrack: true }).trackColor, 'transparent');
  assert.deepEqual(getPackageScrollbar({ ...preference, mode: 'hidden' }), { width: 'none' });
  assert.deepEqual(getPackageScrollbar({ ...preference, mode: 'native' }), { width: 'thin' });
  assert.equal(getPackageScrollbar({ ...preference, mode: 'native', thin: false }), undefined);
  assert.equal(preference.thumbColor, '#123456');
});

test('startup appearance matches package preferences for valid and corrupt saved input', () => {
  for (const value of [
    null,
    { colorScheme: 'forest', scrollbar: { mode: 'hidden' } },
    { version: 1, colorScheme: 'custom', customBrandColors: { primary: '#FFFFFF', secondary: '#000000' }, scrollbar: { mode: 'custom', thumbColor: '#AABBCC', trackColor: '#112233', transparentTrack: false, thin: true } },
    { colorScheme: 'custom', customBrandColors: { primary: [], secondary: 'red' }, scrollbar: { mode: 'custom', thin: 'true', transparentTrack: 'false' } },
    { version: 99, colorScheme: 'plum', scrollbar: { mode: 'hidden' } },
  ]) {
    const appearance = normalizeAppearance(value);
    const result = initializeAppearance({ 'thyncspace-appearance': JSON.stringify(value), 'thyncspace-theme': 'system' }, { systemDark: false });
    assert.equal(result.dataset.theme, 'light');
    assert.equal(result.dataset.colorScheme, appearance.colorScheme);
    assert.equal(result.dataset.scrollbar, appearance.scrollbar.mode);
    const scrollbar = getPackageScrollbar(appearance.scrollbar);
    assert.equal(result.properties['--app-scrollbar-width'], scrollbar?.width ?? 'auto');
    assert.equal(result.properties['--app-scrollbar-color'], scrollbar?.thumbColor ? `${scrollbar.thumbColor} ${scrollbar.trackColor}` : 'auto');
    if (appearance.colorScheme !== 'default') {
      const brand = getPackageBrandColors(appearance, { primary: '#000000', secondary: '#000000' });
      assert.equal(result.properties['--color-accent'], brand.primary);
      assert.equal(result.properties['--color-accent-green'], brand.secondary);
      assert.equal(result.properties['--color-on-accent'], contrastText(brand.primary));
    }
  }
  const unavailable = initializeAppearance({}, { unavailable: true });
  assert.equal(unavailable.dataset.theme, 'dark');
  assert.equal(unavailable.dataset.scrollbar, 'native');
  assert.equal(contrastText('#ffffff'), '#000000');
  assert.equal(contrastText('#000000'), '#ffffff');
});

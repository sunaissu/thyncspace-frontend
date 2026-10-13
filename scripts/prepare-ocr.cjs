const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../public/ocr');
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(require.resolve('tesseract.js/dist/worker.min.js'), path.join(target, 'worker.min.js'));
const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
for (const file of fs.readdirSync(core).filter(name => /^tesseract-core[\w.-]*\.(?:js|wasm)$/.test(name))) fs.copyFileSync(path.join(core, file), path.join(target, file));
fs.copyFileSync(path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int', 'eng.traineddata.gz'), path.join(target, 'eng.traineddata.gz'));

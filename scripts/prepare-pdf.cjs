const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const version = require('pdfjs-dist/package.json').version;
fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.copyFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), path.join(root, 'public', 'pdf-worker-' + version + '.mjs'));

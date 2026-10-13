const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), destination = path.join(root, 'public', 'obsidian-companion');
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(path.join(root, 'integrations', 'obsidian', 'main.cjs'), path.join(destination, 'main.js'));
fs.copyFileSync(path.join(root, 'integrations', 'obsidian', 'manifest.json'), path.join(destination, 'manifest.json'));

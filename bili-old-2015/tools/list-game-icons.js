// tools/list-game-icons.js — the remote icons left in inline style attributes, and where they live
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const body = fs.readFileSync(path.join(ROOT, '_ref', 'body.html'), 'utf8');
const urls = new Set();
for (const src of [body, ...Object.values(frag)]) {
  for (const m of String(src).matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)['"]?\s*\)/g)) urls.add(m[1]);
}
console.log('remote inline-style urls:', urls.size);
[...urls].forEach((u) => console.log('  ', u));
fs.writeFileSync(path.join(ROOT, 'build', 'inline-urls.txt'), [...urls].join('\n'), 'utf8');

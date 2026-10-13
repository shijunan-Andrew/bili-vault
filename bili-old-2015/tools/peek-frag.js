// tools/peek-frag.js — dump one generated fragment's HTML (bounded) for structural review
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const key = process.argv[2] || 'b_index_top';
const max = Number(process.argv[3] || 4000);
const html = String(frag[key]);
console.log(`== ${key} (${html.length} bytes)`);
console.log(html.slice(0, max));
if (html.length > max) console.log(`\n… ${html.length - max} more bytes`);

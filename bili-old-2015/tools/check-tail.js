// tools/check-tail.js — what is left of the ARCHIVED markup between the generated rows and the footer?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rec = html.indexOf('id="b_recommend"');
const foot = html.indexOf('<div class="footer', rec);
console.log('b_recommend at', rec, '| footer at', foot, '| file', html.length);
let tail = html.slice(rec, foot < 0 ? html.length : foot);
// drop the inline stylesheet if it is in this span
tail = tail.replace(/<style[\s\S]*?<\/style>/gi, '<style-omitted/>');
console.log('--- tail length', tail.length, '---');
console.log(tail.slice(0, 2500));
console.log('\n...\n');
console.log(tail.slice(-1200));

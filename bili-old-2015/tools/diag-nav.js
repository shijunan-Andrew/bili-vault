// tools/diag-nav.js — show the index_nav fragment we generate and the css that must place it.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
console.log('--- fragments.index_nav ---');
console.log(frag.index_nav);
const css = fs.readFileSync(path.join(ROOT, 'build', 'index.css'), 'utf8');
const lines = css.split('\n');
for (const sel of ['.index-nav .border', '.index-nav .nav-list', '.index-nav .n-i', '.index-nav .n-i .name', '.index-nav .n-i.gotop', '.index-nav .btn_gotop', '.index-nav .nav-tip']) {
  const at = lines.findIndex((l) => l.trim().startsWith(sel + '{') || l.trim().startsWith(sel + ' {'));
  console.log(`\n${sel}  (build/index.css:${at + 1})`);
  if (at >= 0) console.log(lines.slice(at, at + 12).join('\n'));
}

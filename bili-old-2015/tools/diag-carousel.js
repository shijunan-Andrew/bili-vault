// tools/diag-carousel.js — what does the generated #b_index_top markup contain, and which classes
// control carousel visibility?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const frag = JSON.parse(read('build/fragments.json'));
const html = frag.b_index_top;
const i = html.indexOf('topic-preview-wrapper');
console.log(html.slice(i - 120, i + 1400).replace(/></g, '>\n<'));
console.log('\n--- carousel css in build/index.css ---');
const css = read('build/index.css');
for (const sel of ['.topic-preview-wrapper', '.topic-preview', '.topic-preview li', '.s-bottom', '.s-bottom .title', '.more-topic', '.slider-bar', '#topic_slider']) {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'g');
  let m;
  while ((m = re.exec(css))) {
    const end = css.indexOf('}', m.index);
    console.log(css.slice(m.index, end + 1).replace(/\s+/g, ' '));
  }
}

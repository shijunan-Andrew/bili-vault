// tools/frag-outline.js — what top-level wrappers does fragments.json actually emit?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const top = (html) => {
  // count depth-0 element openers
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
  const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr']);
  let d = 0, m, res = [];
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, sc] = m;
    const t = tag.toLowerCase();
    if (close) { d--; continue; }
    const id = (attrs.match(/\bid="([^"]*)"/) || [])[1];
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1];
    if (d === 0) res.push(t + (id ? '#' + id : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : ''));
    if (!VOID.has(t) && !sc) d++;
  }
  return res;
};
for (const k of Object.keys(frag)) {
  const html = String(frag[k]);
  console.log(`\n== ${k}  ${html.length}B`);
  console.log('   top-level:', top(html).join('\n              '));
}

// tools/dom-outline.js — print the tag/class/id outline of index.html's body (skip the <style>).
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let body = html.slice(html.indexOf('<body'));
body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<!--style-->');

const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g;
let depth = 0;
let m;
let out = 0;
const lines = [];
while ((m = re.exec(body))) {
  const [, close, tag, attrs, selfClose] = m;
  const t = tag.toLowerCase();
  if (close) { depth--; continue; }
  if (t === 'script' || t === 'style') { /* skip content */ }
  const id = (attrs.match(/\bid="([^"]*)"/) || [])[1];
  const cls = (attrs.match(/\bclass="([^"]*)"/) || [])[1];
  if (out < 400) {
    lines.push(
      '  '.repeat(Math.min(depth, 12)) +
      t + (id ? '#' + id : '') + (cls ? '.' + cls.trim().split(/\s+/).join('.') : '') +
      (attrs.includes('data-missing') ? '   [MISSING-IMG]' : '')
    );
    out++;
  }
  if (!VOID.has(t) && !selfClose) depth++;
}
console.log(lines.join('\n'));
console.log('... (truncated at', out, 'nodes)');

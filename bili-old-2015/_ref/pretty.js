const fs = require('fs');
const files = ['page.index.v3.js', 'page.core.js', 'base.core.v3.js'];
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const bodyStart = s.indexOf('{');
  if (bodyStart > 0) s = s.slice(bodyStart);
  let out = '';
  let ind = 0;
  let str = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (str) {
      out += c;
      if (c === '\\') { out += s[++i]; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; out += c; continue; }
    if (c === '{' || c === '[') { ind++; out += c + '\n' + '  '.repeat(ind); continue; }
    if (c === '}' || c === ']') { ind--; out += '\n' + '  '.repeat(Math.max(ind, 0)) + c; continue; }
    if (c === ';') { out += ';\n' + '  '.repeat(ind); continue; }
    if (c === ',') { out += ',\n' + '  '.repeat(ind); continue; }
    out += c;
  }
  fs.writeFileSync(f.replace(/\.js$/, '.pretty.js'), out);
  console.log(f, s.length, '->', out.length);
}

const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const i = html.indexOf('<body');
const b = html.slice(i);
console.log('len', b.length);
const probes = ['container-top-wrapper', 'id="b_index_top"', 'topic-preview', 'top-list-wrapper',
  'id="b_promote"', 'id="b_recommend"', 'id="index_nav"', 'id="b_douga"', 'id="b_teleplay"',
  'rm-list recommend', 'index-nav', 'diag-stub', '<script'];
for (const p of probes) {
  const c = b.split(p).length - 1;
  console.log(String(c).padStart(3), p, '| first@', b.indexOf(p));
}
console.log('--- around container-top-wrapper ---');
const k = b.indexOf('container-top-wrapper');
console.log(JSON.stringify(b.slice(k - 200, k + 900)));

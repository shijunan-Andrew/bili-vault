// tools/check-sections.js — read the generated section markup: id, data-*, title markup, tabs, pane rows
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const frag = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'fragments.json'), 'utf8'));
const html = String(frag.sections);
const secs = html.split(/(?=<div class="container-row" id="b_)/).filter((s) => s.includes('container-row'));
console.log('sections found:', secs.length);
for (const s of secs) {
  const id = (s.match(/id="(b_[a-z]+)"/) || [])[1];
  const attrs = (s.match(/^<div class="container-row"[^>]*>/) || [])[0];
  const tabs = [...s.matchAll(/class="b-slt-tab"[^>]*>([\s\S]{0,200}?)<\/ul>/g)].map((m) => (m[1].match(/>([^<>]+)</g) || []).map((x) => x.slice(1, -1).trim()).filter(Boolean).join('|'));
  const rankSel = [...s.matchAll(/createRankingSelect|rank-select|b-slt\b/g)].length;
  const vitems = (s.match(/class="v-item"/g) || []).length;
  const rlist = (s.match(/class="rlist/g) || []).length;
  const headT = (s.match(/class="b-head-t"[^>]*>([\s\S]{0,80}?)<\//) || [])[1];
  console.log(`\n${id}`);
  console.log('  opener:', attrs);
  console.log('  v-items:', vitems, '| ranking rows:', rlist, '| tab groups:', tabs.length);
  console.log('  b-head-t:', String(headT).replace(/\s+/g, ' ').slice(0, 60));
  tabs.slice(0, 4).forEach((t, i) => console.log(`   tab${i}: ${t}`));
}

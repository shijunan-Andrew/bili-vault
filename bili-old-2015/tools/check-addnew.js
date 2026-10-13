// tools/check-addnew.js — what does the archived page itself show in the .addnew_* spans?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const body = fs.readFileSync(path.join(ROOT, '_ref', 'body.html'), 'utf8');
const spans = [...body.matchAll(/<span class="addnew_(\d+)">([^<]*)<\/span>/g)];
console.log('archived spans:', spans.length);
for (const s of spans) console.log('  addnew_' + s[1], '->', JSON.stringify(s[2]));
// the online.js payload we recovered from the archive
const online = fs.readFileSync(path.join(ROOT, '_ref', 'online.js'), 'utf8');
const countInfo = online.match(/var countInfo\s*=\s*(\{[^}]*\})/);
console.log('\ncountInfo in recovered online.js:', countInfo ? countInfo[1] : 'NOT FOUND');
const webOnline = online.match(/var web_online\s*=\s*(\d+)/);
const playOnline = online.match(/var play_online\s*=\s*(\d+)/);
console.log('web_online =', webOnline && webOnline[1], '| play_online =', playOnline && playOnline[1]);

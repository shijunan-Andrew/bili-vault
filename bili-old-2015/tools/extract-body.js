// tools/extract-body.js — split the archived page into head/body fragments for reference.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = path.join(ROOT, '_ref', 'original-20150701.html');
let s = fs.readFileSync(src, 'utf8');

// strip wayback / extension noise that is not part of the original page
s = s.replace(/<style wxt-shadow-root-document-styles="[^"]*">[\s\S]*?<\/style>/g, '')
     .replace(/<div id="immersive-translate-popup"[\s\S]*$/m, '')
     .replace(/<browser-skill-overlay[\s\S]*$/m, '');

const headStart = s.indexOf('<head');
const headEnd = s.indexOf('</head>') + 7;
const bodyStart = s.indexOf('<body');
const bodyEnd = s.indexOf('</body>') + 7;

const head = s.slice(headStart, headEnd);
const body = s.slice(bodyStart, bodyEnd);

fs.writeFileSync(path.join(ROOT, '_ref', 'head.html'), head, 'utf8');
fs.writeFileSync(path.join(ROOT, '_ref', 'body.html'), body, 'utf8');
console.log('head bytes', Buffer.byteLength(head), '| body bytes', Buffer.byteLength(body));
console.log('title:', (head.match(/<title>([^<]*)<\/title>/) || [])[1]);
console.log('links:', (head.match(/<link[^>]*>/g) || []).length, '| scripts:', (head.match(/<script[^>]*src=[^>]*>/g) || []).length);
const anchors = body.match(/<a\b[^>]*>/g) || [];
console.log('anchors in body:', anchors.length);

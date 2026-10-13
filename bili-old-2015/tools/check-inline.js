// tools/check-inline.js — what got inlined, how big, and are the six carousel slides in?
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const uris = [...html.matchAll(/src="data:([^;]+);base64,([A-Za-z0-9+/=]+)"/g)];
const sizes = uris.map((m) => Math.round(m[2].length * 0.75));
sizes.sort((a, b) => a - b);
console.log('inlined <img> count:', uris.length);
console.log('bytes: min', sizes[0], 'median', sizes[Math.floor(sizes.length / 2)], 'max', sizes[sizes.length - 1], 'total', sizes.reduce((a, b) => a + b, 0));
console.log('under 2KB (suspicious):', sizes.filter((s) => s < 2048).length);
console.log('empty boxes:', (html.match(/data-empty=/g) || []).length);

const hero = /<ul class="topic-preview[^>]*>([\s\S]*?)<\/ul>/.exec(html);
if (hero) {
  const slides = [...hero[1].matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  console.log('\ncarousel slides:', slides.length);
  for (const s of slides) console.log('  ', /src="data:([^;]+)/.exec(s) ? 'IMAGE ' + ((s.match(/base64,([A-Za-z0-9+/=]+)/) || [])[1] || '').length : 'EMPTY', (s.match(/alt="([^"]*)"/) || [])[1]);
} else console.log('carousel block not found');

// tools/list-remote-css.js — what still points at a remote host inside build/index.css?
const fs = require('fs');
const css = fs.readFileSync(require('path').join(__dirname, '..', 'build', 'index.css'), 'utf8');
const urls = [...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2]);
const remote = urls.filter((u) => /^https?:/i.test(u));
console.log('url() total', urls.length, '| remote', remote.length, '| distinct', new Set(remote).size);
const paths = [...new Set(remote.map((u) => u.replace(/^https?:\/\/[^/]+/i, '')))];
fs.writeFileSync(require('path').join(__dirname, '..', 'build', 'remote-css-urls.txt'), paths.join('\n'), 'utf8');
console.log(paths.join('\n'));

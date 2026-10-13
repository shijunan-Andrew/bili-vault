// tools/measure.js — DOM/layout diagnostic injected into the replica page.
// The injected stub replaces itself with the returned HTML so the report can be read
// through browser_inspect html. Run: node tools/measure.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const p = (...a) => path.join(ROOT, ...a);
let html = fs.readFileSync(p('index.html'), 'utf8');

const JS = `(function(){
  function box(sel){
    var el = document.querySelector(sel);
    if (!el) return {sel: sel, missing: true};
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return {sel: sel, x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height),
            display: cs.display, position: cs.position, float: cs.float, opacity: cs.opacity, overflow: cs.overflow, vis: cs.visibility};
  }
  var sels = ['#index_container','.z','.header','#b_index_top','#b_index_top .b-l','#b_index_top .b-r',
    '.topic-preview-wrapper','.topic-preview','#b_promote','#b_promote .b-l','#b_promote .b-r',
    '#index_nav','#b_douga','#b_bangumi','#b_telephone','#b_teleplay','.footer','body','.container-top'];
  var rows = [];
  document.querySelectorAll('#index_container > .container-row').forEach(function(el){
    var r = el.getBoundingClientRect();
    rows.push({id: el.id, y: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width),
               inlineStyle: el.getAttribute('style') || ''});
  });
  var imgs = document.querySelectorAll('#index_container img');
  var withSrc = 0, noSrc = 0, broken = 0;
  imgs.forEach(function(i){ if (!i.getAttribute('src')) noSrc++; else { withSrc++; if (!i.complete || i.naturalWidth === 0) broken++; } });
  var report = '<pre id="diag">' + JSON.stringify({
    scrollHeight: document.body.scrollHeight,
    boxes: sels.map(box), rows: rows,
    imgTotal: imgs.length, imgWithSrc: withSrc, imgNoSrc: noSrc, imgBroken: broken,
    navVisible: (function(){var e=document.querySelector('#index_nav');return e?getComputedStyle(e).opacity+'/'+getComputedStyle(e).position+'/'+getComputedStyle(e).display:'-'})()
  }, null, 1) + '</pre>';
  var stub = document.createElement('div');
  stub.id = 'diag-stub';
  stub.innerHTML = report;
  document.body.appendChild(stub);
})();`;

const stub = `<div id="diag-stub"></div>`;
const script = `<script>setTimeout(function(){${JS}},600);</script>`;
if (html.includes('<div id="diag-stub"></div>')) {
  html = html.replace(/<script>setTimeout\(function\(\)\{[\s\S]*?\},600\);<\/script>/, script);
} else {
  html = html.replace('</body>', stub + script + '</body>');
}
fs.writeFileSync(p('index.html'), html, 'utf8');
console.log('injected diagnostic, bytes', fs.statSync(p('index.html')).size);

// tools/probe-cover.js — can we map a 2015 aid to a cover image on today's bilibili?
const https = require('https');
const A = ['av2505912', 'av20150701'];
function get(url) {
  return new Promise((res) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.bilibili.com/' } }, (r) => {
      const c = [];
      r.on('data', (d) => c.push(d));
      r.on('end', () => res({ status: r.statusCode, body: Buffer.concat(c).toString('utf8') }));
    });
    req.on('error', (e) => res({ status: 'ERR ' + e.code }));
    req.setTimeout(8000, () => { req.destroy(); res({ status: 'TIMEOUT' }); });
  });
}
(async () => {
  const aid = String(require('fs').readFileSync(require('path').join(__dirname, '..', '_ref', 'json', 'ranking-3day.json'), 'utf8')).match(/"aid"\s*:\s*(\d+)/)[1];
  console.log('sample aid from ranking-3day.json:', aid);
  const urls = [
    `https://api.bilibili.com/x/web-interface/view?aid=${aid}`,
    `https://api.bilibili.com/x/web-interface/archive/stat?aid=${aid}`,
  ];
  for (const u of urls) {
    const r = await get(u);
    console.log('\n>>', u, '->', r.status);
    console.log(r.body.slice(0, 300));
  }
})();

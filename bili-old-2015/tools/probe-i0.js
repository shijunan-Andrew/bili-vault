// tools/probe-i0.js — do the 2015 i*.hdslb.com thumbnails survive under today's /bfs/archive/ path?
const https = require('https');
const hashes = [
  ['b1f1e9ad86a018f06d24b1664b579fa6', 'video'],
  ['4aac3d13370a1557589b4c1fa7f11ebe', 'video'],
  ['b041668a707ad5f5af64076f7222471f', 'u_user'],
  ['40375', 'user/path'],
];
const forms = (h) => [
  `https://i0.hdslb.com/bfs/archive/${h}.jpg`,
  `https://i0.hdslb.com/bfs/archive/${h}.png`,
  `https://i2.hdslb.com/320_180/video/${h.slice(0, 2)}/${h}.jpg`,
  `https://i0.hdslb.com/bfs/face/${h}.jpg`,
];
function head(url) {
  return new Promise((res) => {
    const req = https.request(url, { method: 'GET', headers: { Range: 'bytes=0-63', 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      r.resume();
      res({ url, status: r.statusCode, type: r.headers['content-type'], len: r.headers['content-length'] });
    });
    req.on('error', (e) => res({ url, status: 'ERR ' + e.code }));
    req.setTimeout(8000, () => { req.destroy(); res({ url, status: 'TIMEOUT' }); });
    req.end();
  });
}
(async () => {
  const jobs = [];
  for (const [h] of hashes) for (const u of forms(h)) jobs.push(head(u));
  for (const r of await Promise.all(jobs)) console.log(String(r.status).padEnd(8), (r.type || '').padEnd(12), r.url);
})();

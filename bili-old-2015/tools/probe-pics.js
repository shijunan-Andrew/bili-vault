// tools/probe-pics.js — diagnose why the 2015 thumbnail CDN urls fail, and find a working route.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const tests = [
  'https://i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'http://i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'http://i2.hdslb.com/320_180/u_user/b041668a707ad5f5af64076f7d6d0aa8b3d1b4a0.jpg',
  'https://i0.hdslb.com/bfs/archive/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'http://web.archive.org/web/20150701082208im_/http://i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'https://web.archive.org/web/2015im_/http://i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
  'https://web.archive.org/web/2015id_/http://i2.hdslb.com/sp/10/10bd74b80ca240b455ffc770f1fa42ef.jpg',
];
(async () => {
  for (const u of tests) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 25000);
      const r = await fetch(u, { signal: c.signal, redirect: 'follow', headers: { 'User-Agent': UA, Referer: 'http://www.bilibili.com/' } });
      clearTimeout(t);
      const b = Buffer.from(await r.arrayBuffer());
      const head = b.slice(0, 200).toString('utf8').replace(/\s+/g, ' ');
      console.log(`${r.status} ${b.length}B ct=${r.headers.get('content-type')} ${u}\n     head: ${head.slice(0, 120)}`);
    } catch (e) {
      console.log(`ERR ${e.name}: ${e.message} :: ${u}`);
    }
  }
})();

// tools/fetch-covers.js — backfill today's cover for every 2015 video thumbnail.
//
// The 2015 page served thumbnails from i0|i1|i2.hdslb.com, a dead host. We match each
// archived video by `aid` against today's public API:
//   https://api.bilibili.com/x/web-interface/view?aid=<aid>
// read `data.pic`, download it and store it as assets/cover/<aid>.<ext>.
//
// Writes: assets/cover/*.jpg|png|webp  and  assets/COVER-MAP.md
// Resumable: an aid whose file already exists and passes magic-number validation is skipped.
//
// Usage:  node tools/fetch-covers.js
//         node tools/fetch-covers.js --force     (re-fetch every aid, ignore local files)
//         node tools/fetch-covers.js --limit=20  (only first N pending aids; for smoke tests)
//         node tools/fetch-covers.js --map-only  (rewrite COVER-MAP.md from disk state, no network)
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const JSON_DIR = path.join(ROOT, '_ref', 'json');
const COVER_DIR = path.join(ROOT, 'assets', 'cover');
const MAP_FILE = path.join(ROOT, 'assets', 'COVER-MAP.md');

// Every archived payload that can carry video entries (bangumi entries have spid/cover, no aid).
const JSON_FILES = [
  'ranking.json',
  'ranking-3day.json',
  'ranking-week.json',
  'recommend.json',
  'promote.json',
  'ding.json',
  'bangumi.json',
  'slideshow.json',
  'ding-count.json',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const HEADERS = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };

const REQ_TIMEOUT_MS = 20000;
const THROTTLE_MS = 380; // ~2.6 req/s between consecutive requests
const RATE_LIMIT_DELAY_MS = 2500; // 412/429 base backoff
const RATE_LIMIT_RETRIES = 2;
const NETWORK_RETRIES = 2;
const IMAGE_RETRIES = 2;

const TITLE_MAX = 40;
const EXT_BY_TYPE = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const KNOWN_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const MAP_ONLY = argv.includes('--map-only');
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith('--limit='));
  if (!a) return Infinity;
  const n = parseInt(a.split('=')[1], 10);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + THROTTLE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// ---------------------------------------------------------------- http helpers
// GET a url, following redirects. Returns {status, headers, buf}. Network-level
// failures and timeouts come back as {status:0, err}. Never throws.
function httpGet(url, { depth = 0 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let req;
    try {
      req = https.get(url, { headers: HEADERS }, (r) => {
        const status = r.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && r.headers.location) {
          r.resume();
          if (depth >= 5) return done({ status, err: 'too many redirects' });
          let next;
          try {
            next = new URL(r.headers.location, url).href;
          } catch (_) {
            return done({ status, err: 'bad redirect target' });
          }
          if (next.startsWith('http://')) next = 'https://' + next.slice(7); // keep everything on TLS
          return httpGet(next, { depth: depth + 1 }).then(done);
        }
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => done({ status, headers: r.headers, buf: Buffer.concat(chunks) }));
        r.on('error', (e) => done({ status, err: e.code || e.message }));
      });
    } catch (e) {
      return done({ status: 0, err: e.code || e.message });
    }
    req.on('error', (e) => done({ status: 0, err: e.code || e.message }));
    req.setTimeout(REQ_TIMEOUT_MS, () => {
      req.destroy();
      done({ status: 0, err: 'ETIMEDOUT' });
    });
  });
}

function isRateLimited(status) {
  return status === 412 || status === 429 || status === 403;
}

// ------------------------------------------------------------------- image bytes
function sniff(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (
    buf.slice(0, 4).toString('latin1') === 'RIFF' &&
    buf.slice(8, 12).toString('latin1') === 'WEBP'
  )
    return '.webp';
  return null;
}

function leadBytes(buf) {
  return buf && buf.length ? buf.slice(0, 6).toString('hex') : '';
}

// ------------------------------------------------------------- aid collection
function loadJson(file) {
  let raw = fs.readFileSync(path.join(JSON_DIR, file), 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // ding.json ships a BOM
  return JSON.parse(raw);
}

// Recursive walk: every object with a numeric/string `aid` and a `title` is a video entry.
// The `aid` child is skipped so a nested `aid` value is not re-visited as a scalar object.
function collect() {
  const entries = new Map(); // aid -> {aid, title, origPic, files:Set}
  let bangumiOnly = 0;
  const seenSpid = new Set();

  function walk(node, file) {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const v of node) walk(v, file);
      return;
    }
    const rawAid = node.aid;
    const hasAid =
      (typeof rawAid === 'number' || typeof rawAid === 'string') &&
      String(rawAid).trim() !== '' &&
      node.title !== undefined &&
      String(node.title).trim() !== '';
    if (hasAid) {
      const key = String(rawAid).trim();
      if (/^[0-9]+$/.test(key)) {
        let e = entries.get(key);
        if (!e) {
          e = {
            aid: key,
            title: String(node.title).trim(),
            origPic: node.pic || '',
            files: new Set(),
            status: 'not attempted',
            reason: '',
            file: '',
            pic: '',
            resolvedTitle: '',
            bytes: 0,
          };
          entries.set(key, e);
        }
        e.files.add(file);
      }
    } else if (node.spid !== undefined && node.cover !== undefined) {
      const s = String(node.spid);
      if (!seenSpid.has(s)) {
        seenSpid.add(s);
        bangumiOnly++;
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'aid') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, file);
    }
  }

  for (const f of JSON_FILES) {
    if (!fs.existsSync(path.join(JSON_DIR, f))) {
      log(`  ! missing input ${f}`);
      continue;
    }
    walk(loadJson(f), f);
  }
  return { entries, bangumiOnly };
}

// --------------------------------------------------------------- local disk state
function findLocal(aid) {
  for (const ext of KNOWN_EXTS) {
    const p = path.join(COVER_DIR, aid + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// A local file counts as valid only if it passes magic-number validation.
// Anything else is deleted (never leave a non-image saved as an image).
function validateLocal(p) {
  let buf;
  try {
    buf = fs.readFileSync(p);
  } catch (_) {
    return null;
  }
  const kind = sniff(buf);
  if (!kind) {
    try {
      fs.unlinkSync(p);
    } catch (_) {}
    return null;
  }
  return { file: path.basename(p), bytes: buf.length, kind };
}

// ------------------------------------------------------------------- one aid
async function fetchAid(entry, stats) {
  const { aid } = entry;

  // 1) API lookup (rate limits get a long backoff, network errors a short one)
  let api = null;
  let missingReason = '';
  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES + NETWORK_RETRIES; attempt++) {
    await throttle();
    const url = `https://api.bilibili.com/x/web-interface/view?aid=${aid}`;
    const r = await httpGet(url);
    if (r.status === 200 && r.buf) {
      let j = null;
      try {
        j = JSON.parse(r.buf.toString('utf8'));
      } catch (_) {
        api = { code: -1, message: 'unparseable JSON' };
        break;
      }
      if (j.code === 0 && j.data) {
        api = { code: 0, title: j.data.title, pic: j.data.pic };
        break;
      }
      // A real API error code (deleted / private / blocked) is final — do not retry.
      api = { code: j.code, message: j.message || '' };
      break;
    }
    if (isRateLimited(r.status)) {
      if (attempt >= RATE_LIMIT_RETRIES) {
        api = { code: null, message: `HTTP ${r.status} (rate limited)` };
        break;
      }
      await sleep(RATE_LIMIT_DELAY_MS + Math.floor(Math.random() * 2500));
      continue;
    }
    if (r.status === 0) {
      if (attempt >= NETWORK_RETRIES) {
        api = { code: null, message: `network error ${r.err}` };
        break;
      }
      await sleep(800 + Math.floor(Math.random() * 700));
      continue;
    }
    api = { code: null, message: `HTTP ${r.status}` };
    break;
  }

  if (!api || api.code !== 0 || !api.pic) {
    const msg = api ? api.message : 'no response';
    const deleted = api && typeof api.code === 'number' && api.code !== 0;
    entry.status = deleted ? 'missing' : 'failed';
    entry.reason = deleted ? `api code ${api.code}${msg ? ' ' + msg : ''}` : msg;
    entry.resolvedTitle = (api && api.title) || '';
    entry.pic = '';
    stats[deleted ? 'missing' : 'failed']++;
    return;
  }

  // 2) Normalise the pic url to https and download the image bytes
  let pic = String(api.pic).trim();
  if (pic.startsWith('//')) pic = 'https:' + pic;
  else if (pic.startsWith('http://')) pic = 'https://' + pic.slice(7);
  else if (!/^https:\/\//i.test(pic)) pic = 'https://' + pic.replace(/^\/+/, '');
  if (!entry.origPic) entry.origPic = pic;
  entry.pic = pic;
  entry.resolvedTitle = api.title || entry.title;

  let img = null;
  let lastErr = '';
  for (let attempt = 0; attempt <= IMAGE_RETRIES; attempt++) {
    await throttle();
    const r = await httpGet(pic);
    if (r.status === 200 && r.buf && r.buf.length) {
      const kind = sniff(r.buf);
      if (kind) {
        img = { buf: r.buf, kind, ct: r.headers['content-type'] || '' };
        break;
      }
      lastErr = `not an image (magic ${leadBytes(r.buf) || 'empty'}, ct ${r.headers['content-type'] || '?'})`;
      break; // wrong bytes will not fix themselves
    }
    if (r.status === 0) {
      lastErr = `network error ${r.err}`;
      if (attempt >= IMAGE_RETRIES) break;
      await sleep(800 + Math.floor(Math.random() * 700));
      continue;
    }
    lastErr = `HTTP ${r.status}`;
    if (isRateLimited(r.status) && attempt < IMAGE_RETRIES) {
      await sleep(RATE_LIMIT_DELAY_MS + Math.floor(Math.random() * 2000));
      continue;
    }
    break;
  }

  if (!img) {
    entry.status = 'failed';
    entry.reason = `cover download: ${lastErr}`;
    stats.failed++;
    return;
  }

  // 3) Persist — validate the bytes again after the round-trip, then rename into place
  let ext = EXT_BY_TYPE[img.ct.split(';')[0].trim().toLowerCase()] || img.kind;
  if (ext === '.jpeg') ext = '.jpg';
  const finalPath = path.join(COVER_DIR, aid + ext);
  const tmpPath = finalPath + '.part';
  try {
    fs.writeFileSync(tmpPath, img.buf);
    const check = fs.readFileSync(tmpPath);
    if (!sniff(check)) throw new Error('magic check failed after write');
    const old = findLocal(aid);
    if (old && old !== finalPath) fs.unlinkSync(old);
    fs.renameSync(tmpPath, finalPath);
  } catch (e) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) {}
    entry.status = 'failed';
    entry.reason = `write failed: ${e.message}`;
    stats.failed++;
    return;
  }

  entry.status = 'downloaded';
  entry.file = path.basename(finalPath);
  entry.bytes = img.buf.length;
  stats.downloaded++;
  stats.bytes += img.buf.length;
}

// ------------------------------------------------------------------- report
function truncate(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3) + '...';
}
// A literal '|' inside a title would desync the markdown table. Escaping it as
// '\|' is valid GFM but breaks naive column splitting, so substitute U+FF5C,
// which reads identically in a table and cannot collide with a delimiter.
const sanitize = (s) => s.replace(/\|/g, '\uFF5C');
const cell = (s) => sanitize(truncate(s, 200));
// The title column is capped at TITLE_MAX chars by construction, not just by
// truncate()'s generic 200.
const titleCell = (s) =>
  sanitize(truncate(String(s == null ? '' : s).replace(/\s+/g, ' ').trim(), TITLE_MAX));

function writeMap(entries, stats, meta) {
  const rows = [...entries.values()].sort((a, b) => Number(a.aid) - Number(b.aid));
  const notAttempted = stats.notAttempted || 0;
  const L = [];
  L.push('# COVER-MAP');
  L.push('');
  L.push('Thumbnail backfill for the 2015-07-01 homepage replica.');
  L.push('');
  L.push(
    'Every 2015 video thumbnail was served from `i0|i1|i2.hdslb.com`, a host that is dead today. ' +
      'Each archived video is matched by `aid` against the live API ' +
      '`https://api.bilibili.com/x/web-interface/view?aid=<aid>`, and the **current** cover ' +
      '(`data.pic`) is downloaded to `assets/cover/<aid>.<ext>`.'
  );
  L.push('');
  L.push('- `aid` — archived video id.');
  L.push('- `title` — title from the API when it answered, otherwise the archived 2015 title (truncated to 40 chars).');
  L.push('- `status` — `downloaded` (valid image on disk) | `missing` (deleted/private, API returned a non-zero code) | `failed` (network/HTTP/validation failure) | `not attempted` (run was interrupted or limited).');
  L.push('- `local file` — path under `assets/cover/`, empty when nothing was written.');
  L.push('- `source pic URL` — the cover url the API returned (the 2015 archived url is shown for entries whose API lookup never succeeded).');
  L.push('- `reason` — empty for `downloaded`; otherwise the API code/message or the failure detail.');
  L.push('- `from` — the archived JSON payload(s) the aid was collected from.');
  L.push('');
  L.push(`Generated: ${meta.generated} · node ${process.version} · \`node tools/fetch-covers.js\``);
  L.push('');
  L.push(
    `**Summary — total aids: ${rows.length} · downloaded: ${stats.downloaded + stats.skipped} · missing (deleted/private): ${stats.missing} · failed: ${stats.failed} · not attempted: ${notAttempted}**`
  );
  L.push('');
  L.push('| aid | title | status | local file | source pic URL | reason | from |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const e of rows) {
    const file = e.status === 'downloaded' && e.file ? 'assets/cover/' + e.file : '';
    const src = e.pic || e.origPic || '';
    const from = [...e.files].join(', ');
    const reason = e.status === 'downloaded' ? '' : e.reason || '';
    L.push(
      `| ${e.aid} | ${titleCell(e.resolvedTitle || e.title)} | ${e.status} | ${file} | ${cell(src)} | ${cell(reason)} | ${cell(from)} |`
    );
  }
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(
    `total aids: ${rows.length} · downloaded: ${stats.downloaded + stats.skipped} · missing (deleted/private): ${stats.missing} · failed: ${stats.failed} · not attempted: ${notAttempted}`
  );
  L.push('');
  L.push(
    `This run: ${stats.downloaded} freshly downloaded · ${stats.skipped} already on disk (skipped)${stats.failed ? ` · ${stats.failed} failed` : ''}.`
  );
  L.push('');
  L.push(
    `Bangumi entries carrying \`spid\`/\`cover\` instead of \`aid\` were skipped by design: ${meta.bangumiOnly}.`
  );
  L.push(
    `Downloaded bytes: ${stats.bytes} (see \`assets/cover/\` for the on-disk size).`
  );
  L.push('');
  if (stats.missing + stats.failed + notAttempted > 0) {
    L.push('### Not downloaded');
    L.push('');
    for (const e of rows) {
      if (e.status === 'downloaded') continue;
      L.push(`- \`${e.aid}\` — ${e.status}: ${e.reason || 'no reason recorded'} (${titleCell(e.resolvedTitle || e.title)})`);
    }
    L.push('');
  }
  L.push('_No cover was invented: a row is `downloaded` only if the bytes on disk passed a JPEG/PNG/WebP magic-number check._');
  L.push('');
  fs.writeFileSync(MAP_FILE, L.join('\n'), 'utf8');
}

// ---------------------------------------------------------------------- main
(async () => {
  const started = Date.now();
  fs.mkdirSync(COVER_DIR, { recursive: true });

  const { entries, bangumiOnly } = collect();
  const stats = { downloaded: 0, missing: 0, failed: 0, skipped: 0, notAttempted: 0, bytes: 0 };

  // Pass 1: settle every aid that is already on disk (resumability).
  const pending = [];
  for (const e of entries.values()) {
    if (!FORCE) {
      const p = findLocal(e.aid);
      if (p) {
        const v = validateLocal(p);
        if (v) {
          e.status = 'downloaded';
          e.file = v.file;
          e.bytes = v.bytes;
          e.resolvedTitle = e.title;
          e.reason = '';
          stats.skipped++;
          stats.bytes += v.bytes;
          continue;
        }
        log(`  ! ${e.aid} local file ${path.basename(p)} was not a valid image — re-fetching`);
      }
    }
    e.status = 'not attempted';
    e.reason = '';
    pending.push(e);
  }

  log(`collected ${entries.size} distinct aids from ${JSON_FILES.length} payload(s)`);
  log(`already on disk: ${stats.skipped} · to fetch: ${pending.length}${bangumiOnly ? ` · bangumi spid entries skipped: ${bangumiOnly}` : ''}`);

  if (MAP_ONLY) {
    for (const e of pending) {
      e.status = 'not attempted';
      e.reason = 'not attempted (--map-only, no network request)';
      stats.notAttempted++;
    }
    writeMap(entries, stats, { generated: new Date().toISOString(), bangumiOnly });
    log(`--map-only: wrote ${path.relative(ROOT, MAP_FILE)} without any network request`);
    return;
  }

  const queue = LIMIT === Infinity ? pending : pending.slice(0, LIMIT);
  let n = 0;
  let consecutiveNetworkFailures = 0;

  for (const e of queue) {
    n++;
    try {
      await fetchAid(e, stats);
    } catch (err) {
      e.status = 'failed';
      e.reason = `unexpected: ${err && err.message ? err.message : String(err)}`;
      stats.failed++;
    }
    const tail =
      e.status === 'downloaded'
        ? `ok ${e.bytes}B ${e.file}`
        : `${e.status}: ${e.reason}`;
    log(`[${n}/${queue.length}] ${e.aid} ${tail}`);

    consecutiveNetworkFailures = /network error|ETIMEDOUT|ENOTFOUND|ECONNRESET/.test(e.reason || '')
      ? consecutiveNetworkFailures + 1
      : 0;
    if (consecutiveNetworkFailures >= 10) {
      log('!! 10 consecutive network failures — the API looks unreachable from this machine; stopping.');
      break;
    }

    // Keep the report fresh even if the run is interrupted halfway.
    if (n % 25 === 0) {
      writeMap(entries, stats, { generated: new Date().toISOString(), bangumiOnly });
    }
  }

  // Whatever the queue never reached keeps the `not attempted` status.
  for (const e of entries.values()) if (e.status === 'not attempted') stats.notAttempted++;

  writeMap(entries, stats, { generated: new Date().toISOString(), bangumiOnly });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  log('');
  log(
    `done in ${secs}s — total aids: ${entries.size} · downloaded: ${stats.downloaded} · missing: ${stats.missing} · failed: ${stats.failed} · not attempted: ${stats.notAttempted} · skipped: ${stats.skipped}`
  );
  log(`map: ${path.relative(ROOT, MAP_FILE)}`);
})();

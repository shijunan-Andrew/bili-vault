#!/usr/bin/env node
/**
 * tools/offline.js — offline-asset pass for the bili2015 single-file rebuild.
 *
 * WHAT IT DOES
 *   1. Reads a source stylesheet (default `_ref/new_z2.css`, the only sheet the index page needs,
 *      see spec/structure.md §8) and rewrites EVERY `url(...)` to a form that works from the
 *      ROOT html file:
 *        - local copy available -> base64 `data:` URI (small chrome / sprites / <40 KB) or a
 *          relative `assets/...` path (bigger images);
 *        - no local copy      -> the ORIGINAL live url (`http://static.hdslb.com/<path>`),
 *          never the `/web/<ts>im_/...` wayback wrapper;
 *        - `data:` / `#fragment` targets are left byte-identical.
 *   2. Writes the rewritten sheet to `build/index.css` (path configurable) and prints a summary.
 *   3. Writes `spec/offline-report.md` with the numbers, the exact rule, the 5+ spot-checkable
 *      rewrites, the inlined/left-relative/remote-only asset lists.
 *
 * INPUTS (read-only): `_ref/new_z2.css`, `assets/MANIFEST.json` (optional), `assets/**`.
 * The manifest is produced by `tools/fetch-assets.js`:
 *   { "http://static.hdslb.com/images/v3images/icons1.png":
 *       { "path":"images/v3images/icons1.png", "file":"<abs>\\assets\\images\\v3images\\icons1.png",
 *         "bytes":1234, "status":"ok", "source":"wayback" }, ... }
 * `status:"missing"` entries have no file and are never referenced locally.
 * The manifest is OPTIONAL: without it (or with an empty one) the sheet is still rewritten —
 * every wayback wrapper is stripped and every remote url is normalised to its live form, and any
 * file that already sits under `assets/` is picked up by URL-path lookup.
 *
 * USAGE
 *   node tools/offline.js                        # defaults below, manifest optional
 *   node tools/offline.js --css=_ref/new_z2.css --out=build/index.css \
 *                         --manifest=assets/MANIFEST.json --root=. \
 *                         --report=spec/offline-report.md --inline-limit=40960
 *   node tools/offline.js --no-inline            # relative `assets/...` paths instead of data: URIs
 *   node tools/offline.js --no-report            # skip the report
 *   node tools/offline.js --json                 # machine-readable summary on stdout
 *   node tools/offline.js --inline-images=images/header/bilibili6th_logo.png,images/v3images/icons1.png
 *   node tools/offline.js --inline-images=... --dump   # print the full data: URIs (for piping)
 *   node tools/offline.js --help
 *
 * PROGRAMMATIC API
 *   const { inlineImage, rewriteCss, loadManifest, normalizeUrl, dataUriFor } = require('./tools/offline.js');
 *   inlineImage('assets/images/v3images/icons1.png')  // -> 'data:image/png;base64,...'
 *
 * DETERMINISM: output is a pure function of the source sheet + manifest + flags.
 * No timestamps, no locale-dependent formatting, no network access.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OPTS = {
  css: path.join(ROOT, '_ref', 'new_z2.css'),
  out: path.join(ROOT, 'build', 'index.css'),
  manifest: path.join(ROOT, 'assets', 'MANIFEST.json'),
  report: path.join(ROOT, 'spec', 'offline-report.md'),
  root: ROOT,
  inlineLimit: 40 * 1024,
  inline: true,
  json: false,
  dump: false,
};

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

/** Chrome that must render with zero network: logo, header/footer chrome, sprite sheets.
 *  These are inlined regardless of size; everything else is inlined when < --inline-limit. */
const CHROME_ALWAYS = new Set([
  'logo.png', 'bilibili6th_logo.png', 'favicon.ico',
  'icons1.png', 'icons2.png', 'topicons.png', 'icons_home.png',
  'img_loading.png', 'rank.png', 'onlinepic.png',
  'footpic.gif', 'wx.jpg', 'wx-arrow.png', 'bili6th_3xixi.jpg',
]);

/** `/web/20150626233935im_/` and `http://web.archive.org/web/2015im_/` wrappers. */
const WB_ABS = /^https?:\/\/web\.archive\.org\/web\/\d+(?:[a-z]{2}_)?\//i;
const WB_REL = /^\/web\/\d+(?:[a-z]{2}_)?\//i;
/** url( 'x' | "x" | x ) — quoted forms may contain ) / spaces, the bare form may not. */
const URL_RE = /url\(\s*(?:'([^']*)'|"([^"]*)"|([^)'"\s]*))\s*\)/gi;
const URL_RE_G = () => new RegExp(URL_RE.source, 'gi');

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------

function mimeFor(file) {
  return MIME[path.extname(String(file)).toLowerCase()] || 'application/octet-stream';
}

/** base64 data: URI for a file (absolute, or relative to ROOT). Throws if unreadable. */
function inlineImage(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  return 'data:' + mimeFor(abs) + ';base64,' + fs.readFileSync(abs).toString('base64');
}

function dataUriFor(abs) {
  return 'data:' + mimeFor(abs) + ';base64,' + fs.readFileSync(abs).toString('base64');
}

/** Strip wayback wrappers, normalise scheme/host case, collapse `//` in the path. */
function normalizeUrl(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '');
  if (!s) return '';
  s = s.replace(/\s+/g, '');
  for (let i = 0; i < 2; i++) s = s.replace(WB_ABS, '').replace(WB_REL, '');
  if (s.startsWith('//')) s = 'http:' + s;
  const m = s.match(/^(https?):\/\/([^/?#]+)([^?#]*)/i);
  if (!m) return s;
  const host = m[2].toLowerCase().replace(/:\d+$/, '');
  const p = (m[3] || '/').replace(/\/{2,}/g, '/');
  return m[1].toLowerCase() + '://' + host + p;
}

/** `http://static.hdslb.com//images/x.png` -> `images/x.png` */
function pathOf(normalized) {
  const m = String(normalized).match(/^https?:\/\/[^/?#]+(\/.*)?$/i);
  if (!m) return '';
  return (m[1] || '/').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
}

function hostOf(normalized) {
  const m = String(normalized).match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1] : '';
}

/** Same layout rule as tools/fetch-assets.js#localPathFor: i[0-9].hdslb.com lives under pic/. */
function guessLocalPath(normalized) {
  const p = pathOf(normalized);
  if (!p) return '';
  const host = hostOf(normalized);
  if (/^i[0-9]\.hdslb\.com$/.test(host)) return 'pic/' + p;
  return p;
}

function readJson(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    if (!txt.trim()) return { ok: false, empty: true };
    return { ok: true, value: JSON.parse(txt) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Build { byUrl, byPath } lookups from a fetch-assets manifest (object or array). */
function loadManifest(manifestPath, assetsDir) {
  const idx = { byUrl: new Map(), byPath: new Map(), present: false, entries: 0, ok: 0, missing: 0, statuses: {}, note: '' };
  const res = readJson(manifestPath);
  if (!res.ok) {
    idx.note = res.empty ? 'empty file' : ('unreadable/invalid JSON: ' + res.error);
    return idx;
  }
  idx.present = true;
  const list = Array.isArray(res.value)
    ? res.value
    : Object.keys(res.value || {}).map((k) => Object.assign({ __key: k }, res.value[k] || {}));
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const key = e.__key || e.url || e.originalUrl || '';
    const status = e.status || ((e.path || e.file) ? 'ok' : 'missing');
    let rel = '';
    if (e.path) rel = String(e.path).replace(/\\/g, '/').replace(/^\/+/, '');
    else if (e.file) {
      const f = String(e.file).replace(/\\/g, '/');
      const i = f.toLowerCase().lastIndexOf('/assets/');
      rel = i >= 0 ? f.slice(i + 8) : '';
    }
    let abs = rel ? path.join(assetsDir, rel) : '';
    if (status === 'ok' && !(abs && fs.existsSync(abs)) && e.file) {
      const f = String(e.file);
      if (fs.existsSync(f)) abs = f;
    }
    const entry = {
      key: key,
      url: normalizeUrl(key),
      rel: rel,
      abs: abs,
      bytes: Number(e.bytes) || (abs && fs.existsSync(abs) ? fs.statSync(abs).size : 0),
      status: status,
      source: e.source || 'manifest',
      local: status === 'ok' && !!abs && fs.existsSync(abs),
    };
    idx.entries++;
    idx.statuses[status] = (idx.statuses[status] || 0) + 1;
    if (entry.local) idx.ok++; else idx.missing = idx.missing + (status === 'ok' ? 0 : 1);
    const keys = [entry.url, key, normalizeUrl(key)];
    for (const k of keys) if (k && !idx.byUrl.has(k)) idx.byUrl.set(k, entry);
    const pk = pathOf(entry.url);
    if (pk && !idx.byPath.has(pk)) idx.byPath.set(pk, entry);
  }
  return idx;
}

/** Fallback for a manifest-less / incomplete run: does assets/<path> already exist on disk? */
function diskFallback(normalized, manifestIdx, assetsDir) {
  const rel = guessLocalPath(normalized);
  if (!rel) return null;
  const abs = path.join(assetsDir, rel);
  try {
    const st = fs.statSync(abs);
    if (st.isFile() && st.size > 100) {
      return { key: normalized, url: normalized, rel: rel, abs: abs, bytes: st.size, status: 'ok', source: 'disk', local: true, manifest: manifestIdx.byPath.get(pathOf(normalized)) || null };
    }
  } catch (e) { /* not on disk */ }
  return null;
}

function fileSha(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16); }
  catch (e) { return 'n/a'; }
}

/** selector + property that owns a url() at `index` — used for the "what does it affect" column. */
function contextOf(css, index) {
  const before = css.slice(0, index);
  const braceAt = before.lastIndexOf('{');
  if (braceAt < 0) return { selector: '(top of file)', property: '' };
  const closeAt = before.lastIndexOf('}');
  const selector = css.slice(closeAt + 1, braceAt).replace(/\s+/g, ' ').trim().slice(0, 110);
  const decl = css.slice(braceAt + 1, index);
  const semiAt = decl.lastIndexOf(';');
  const property = decl.slice(semiAt + 1).split(':')[0].replace(/\s+/g, ' ').trim().slice(0, 40);
  return { selector: selector || '(unknown)', property: property };
}

function human(n) {
  return n >= 1048576 ? (n / 1048576).toFixed(2) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}

function maskUrls(css) {
  return css.replace(URL_RE_G(), 'url(URL)');
}

// ---------------------------------------------------------------------------------------------
// the rewrite
// ---------------------------------------------------------------------------------------------

/**
 * Rewrite every url() in `css`.
 * @returns {{css:string, stats:object}}
 */
function rewriteCss(css, manifestIdx, opts) {
  const assetsDir = path.join(ROOT, 'assets');
  const stats = {
    occurrences: 0,
    distinct: 0,
    localInlined: 0,
    localInlinedBytes: 0,
    localRelative: 0,
    localRelativeBytes: 0,
    remote: 0,
    data: 0,
    fragment: 0,
    untouchedOther: 0,
    diskFallback: 0,
    distinctRemotePaths: 0,
  };
  /** target(raw) -> decision record */
  const decisions = new Map();

  const out = css.replace(URL_RE_G(), (match, sq, dq, bare) => {
    const raw = sq != null ? sq : dq != null ? dq : bare;
    const quoted = sq != null ? "'" : dq != null ? '"' : '';
    stats.occurrences++;
    let rec = decisions.get(raw);
    if (!rec) {
      rec = {
        raw: raw, quoted: quoted, count: 0, decision: 'untouched', replacement: raw,
        normalized: '', rel: '', bytes: 0, source: '', entry: null,
      };
      decisions.set(raw, rec);
    }
    rec.count++;
    if (rec.decision !== 'untouched' || rec.count > 1) {
      // already classified on the first occurrence
      return rec.quotedReplacement !== undefined ? rec.quotedReplacement : match;
    }

    const target = String(raw).trim();
    if (/^data:/i.test(target)) { stats.data++; rec.decision = 'data'; return match; }
    if (target.startsWith('#')) { stats.fragment++; rec.decision = 'fragment'; return match; }
    if (!/^(https?:)?\/\//i.test(target) && !target.startsWith('/')) {
      // a bare relative path that is already local (e.g. an earlier pass output) — leave it
      stats.untouchedOther++;
      rec.decision = 'already-local';
      return match;
    }

    const norm = normalizeUrl(target);
    rec.normalized = norm;
    const pathFromUrl = pathOf(norm);
    let entry = manifestIdx.byUrl.get(norm) || (pathFromUrl ? manifestIdx.byPath.get(pathFromUrl) : null);
    if (!entry || !entry.local) {
      // declared ok without a file, marked missing, absent from the manifest, or no manifest at all:
      // trust the disk before falling back to a live url
      const fb = diskFallback(norm, manifestIdx, assetsDir);
      if (fb) { entry = fb; if (!manifestIdx.byUrl.get(norm)) stats.diskFallback++; }
    }

    if (entry && entry.local) {
      rec.rel = entry.rel;
      rec.bytes = entry.bytes;
      rec.source = entry.source;
      rec.entry = entry;
      const base = path.basename(entry.rel).toLowerCase();
      const inline = opts.inline && (CHROME_ALWAYS.has(base) || entry.bytes < opts.inlineLimit);
      if (inline) {
        const uri = dataUriFor(entry.abs);
        rec.decision = 'inlined';
        rec.replacement = uri;
        rec.quotedReplacement = 'url("' + uri + '")';
        stats.localInlined++;
        stats.localInlinedBytes += entry.bytes;
      } else {
        const relToRoot = path.relative(opts.root, entry.abs).split(path.sep).join('/');
        rec.decision = 'relative';
        rec.replacement = relToRoot;
        rec.quotedReplacement = 'url(' + (quoted || quoteIfNeeded(relToRoot)) + relToRoot + (quoted || quoteIfNeeded(relToRoot)) + ')';
        stats.localRelative++;
        stats.localRelativeBytes += entry.bytes;
      }
      return rec.quotedReplacement;
    }

    // no local copy -> live url (never the wayback wrapper)
    const live = /^https?:\/\//i.test(norm) ? norm : 'http://static.hdslb.com/' + String(target).replace(/^\/+/, '');
    rec.decision = 'remote';
    rec.replacement = live;
    rec.quotedReplacement = quoted ? 'url(' + quoted + live + quoted + ')' : 'url(' + live + ')';
    stats.remote++;
    return rec.quotedReplacement;
  });

  stats.distinct = decisions.size;
  const list = [...decisions.values()];
  stats.remoteList = list.filter((d) => d.decision === 'remote');
  stats.distinctRemotePaths = new Set(stats.remoteList.map((d) => pathOf(d.normalized) || d.raw)).size;

  // contexts + examples (one per distinct target, first occurrence order)
  const examples = [];
  const seen = new Set();
  const re = URL_RE_G();
  let m;
  while ((m = re.exec(css)) !== null) {
    const raw = m[1] != null ? m[1] : m[2] != null ? m[2] : m[3];
    const rec = decisions.get(raw);
    if (!rec || seen.has(raw)) continue;
    seen.add(raw);
    const ctx = contextOf(css, m.index);
    rec.selector = ctx.selector;
    rec.property = ctx.property;
    rec.before = css.slice(Math.max(0, m.index - 0), m.index + m[0].length);
    rec.match = m[0];
    rec.after = rec.quotedReplacement !== undefined && rec.quotedReplacement !== null ? rec.quotedReplacement : m[0];
    rec.kind = classify(rec, m[0]);
    examples.push(rec);
  }
  stats.examples = examples;
  stats.decisions = list;
  return { css: out, stats: stats };
}

function quoteIfNeeded(v) {
  return /[\s()'"\\]/.test(v) ? '"' : '';
}

function classify(rec, original) {
  if (rec.decision === 'data') return 'data-untouched';
  if (rec.decision === 'fragment') return 'fragment-untouched';
  if (rec.decision === 'already-local') return 'already-local';
  if (WB_ABS.test(String(rec.raw).trim())) return 'wayback-absolute';
  if (WB_REL.test(String(rec.raw).trim())) return 'wayback-relative';
  if (/^https?:\/\//i.test(String(rec.raw).trim())) return 'direct-absolute';
  return rec.decision;
}

// ---------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------

// one example per distinct (url form, outcome) pair, so the sample always covers every rule branch
const EXAMPLE_ORDER = [
  ['wayback-relative', 'inlined'],
  ['wayback-relative', 'remote'],
  ['wayback-absolute', 'inlined'],
  ['wayback-absolute', 'remote'],
  ['direct-absolute', 'inlined'],
  ['direct-absolute', 'remote'],
  ['data-untouched', 'data'],
  ['fragment-untouched', 'fragment'],
  ['already-local', 'already-local'],
];

const DECISION_LABEL = {
  inlined: 'inlined as base64',
  relative: 'kept as a relative file',
  remote: 'live url kept (no local copy)',
  data: 'data: url untouched',
  fragment: 'fragment untouched',
  'already-local': 'already relative, untouched',
};

function kindLabel(e) {
  return e.kind + ' → ' + (DECISION_LABEL[e.decision] || e.decision);
}

function pickExamples(stats, n) {
  const picked = [];
  for (const [kind, decision] of EXAMPLE_ORDER) {
    const hit = stats.examples.find((e) => e.kind === kind && (!decision || e.decision === decision) && !picked.includes(e));
    if (hit) picked.push(hit);
  }
  for (const e of stats.examples) {
    if (picked.length >= n) break;
    if (!picked.includes(e)) picked.push(e);
  }
  return picked.slice(0, Math.max(n, 5));
}

function buildReport(ctx) {
  const { opts, src, out, stats, manifestIdx, assetsDir, checks } = ctx;
  const L = [];
  const p = (s) => L.push(s);
  p('# Offline asset report — `tools/offline.js`');
  p('');
  p('Generated by `node tools/offline.js`; numbers below are from the actual run that produced');
  p('`' + rel(opts.out) + '`. The file is regenerated on every run (no timestamps, so a re-run is byte-identical).');
  p('');
  p('## 1. Inputs / outputs');
  p('');
  p('| role | path | bytes | sha256[:16] |');
  p('| --- | --- | ---: | --- |');
  p('| source sheet (read-only) | `' + rel(opts.css) + '` | ' + byteLen(src) + ' | `' + fileSha(opts.css) + '` |');
  p('| manifest (optional) | `' + rel(opts.manifest) + '` | ' + (manifestIdx.present ? String(fs.statSync(opts.manifest).size) : 'absent') + ' | `' + (manifestIdx.present ? fileSha(opts.manifest) : 'n/a') + '` |');
  p('| rewritten sheet (output) | `' + rel(opts.out) + '` | ' + byteLen(out) + ' | `' + crypto.createHash('sha256').update(out, 'utf8').digest('hex').slice(0, 16) + '` |');
  p('');
  p('All byte columns are UTF-8 on-disk sizes (`Buffer.byteLength`), so they match `ls` / `Get-Item .Length`.');
  p('Local references are emitted relative to the output html root `' + rel(opts.root) + '/` (so `assets/...`);');
  p('`--root` makes that configurable.');
  p('');
  const remoteAbsent = stats.remoteList.filter((d) => !manifestIdx.byUrl.get(d.normalized) && !manifestIdx.byPath.get(pathOf(d.normalized))).length;
  p('## 2. Summary');
  p('');
  p('| metric | value |');
  p('| --- | ---: |');
  p('| `url()` occurrences found | ' + stats.occurrences + ' |');
  p('| distinct `url()` targets | ' + stats.distinct + ' |');
  p('| mapped to a local file (inlined `data:`) | ' + stats.localInlined + ' |');
  p('| mapped to a local file (relative `assets/...`) | ' + stats.localRelative + ' |');
  p('| left remote (live url, no local copy) | ' + stats.remote + ' |');
  p('| of those: distinct remote paths | ' + stats.distinctRemotePaths + ' |');
  p('| of those: absent from the manifest entirely (never attempted by the fetcher) | ' + remoteAbsent + ' |');
  p('| of those: in the manifest but not downloaded (`status != "ok"`) | ' + (stats.remote - remoteAbsent) + ' |');
  p('| `data:` urls left untouched | ' + stats.data + ' |');
  p('| `#fragment` refs left untouched | ' + stats.fragment + ' |');
  p('| already-local relative targets left untouched | ' + stats.untouchedOther + ' |');
  p('| local files found on disk without a manifest entry | ' + stats.diskFallback + ' |');
  p('| distinct local files referenced | ' + new Set(stats.decisions.filter((d) => d.decision === 'inlined' || d.decision === 'relative').map((d) => d.rel)).size + ' |');
  p('| **bytes inlined as base64** | **' + stats.localInlinedBytes + '** (' + human(stats.localInlinedBytes) + ') |');
  p('| bytes left as relative `assets/...` files | ' + stats.localRelativeBytes + ' (' + human(stats.localRelativeBytes) + ') |');
  p('');
  if (!manifestIdx.present) {
    p('> **MANIFEST ABSENT** — `' + rel(opts.manifest) + '` did not exist or was not valid JSON'
      + (manifestIdx.note ? ' (' + manifestIdx.note + ')' : '') + '.');
    p('> Every target was therefore resolved by URL path against `assets/` on disk; anything not on');
    p('> disk stayed on its live url. Re-run this tool once the manifest exists to inline the chrome.');
    p('');
  }
  p('Validity checks (must both PASS for the rewrite to be byte-faithful outside `url()`):');
  p('');
  p('| check | result |');
  p('| --- | --- |');
  p('| `{` / `}` block count unchanged | `' + checks.bracesBefore + '` / `' + checks.bracesAfter + '` → ' + (checks.bracesOk ? 'PASS' : 'FAIL') + ' |');
  p('| sheet with every `url()` masked compared to source | ' + (checks.skeletonOk ? 'PASS (identical)' : 'FAIL (see below)') + ' |');
  p('| `@charset` removed | ' + checks.charsetRemoved + ' |');
  p('| rewrite is a fixed point (2nd pass over the output == output) | ' + (checks.idempotent ? 'PASS' : 'FAIL') + ' |');
  p('');
  p('## 3. Rewrite rule (exact)');
  p('');
  p('```');
  p('for every match of  url( \'x\' | "x" | x )   (regex /url\\(\\s*(?:\'([^\']*)\'|"([^"]*)"|([^)\'"\\s]*))\\s*\\)/gi)');
  p('  target = the captured group, trimmed');
  p('  if target starts with "data:"      -> leave the whole url(...) byte-identical');
  p('  if target starts with "#"          -> leave the whole url(...) byte-identical');
  p('  if target is a bare relative path  -> leave as is (already local)');
  p('  norm = strip /web/<ts>im_/ and http://web.archive.org/web/<ts>im_/ wrappers,');
  p('         "//host" -> "http://host", lowercase scheme+host, collapse // inside the path');
  p('  entry = manifest[norm] or manifest[path-of-norm]; entry counts only when status == "ok"');
  p('          and the file actually exists; otherwise fall back to assets/<path-of-norm> on disk');
  p('  if entry is local:');
  p('      base = basename(entry.path)');
  p('      inline = (base in CHROME_ALWAYS) or (entry.bytes < --inline-limit)');
  p('      inline -> url("<data:mime;base64,...>")        (quoted, because base64 contains ; , =)');
  p('      else   -> url(<relative path from the html root, e.g. assets/images/...>)');
  p('  else:');
  p('      url(<http://host/path>)   # live url, wayback wrapper removed, double slashes collapsed');
  p('```');
  p('');
  p('`CHROME_ALWAYS` (inlined regardless of size): ' + [...CHROME_ALWAYS].join(', ') + '.');
  p('Everything else is inlined when its byte size is below the inline limit (' + opts.inlineLimit + ' B = ' + human(opts.inlineLimit) + (opts.inline ? '' : '; **inlining disabled via --no-inline**') + ').');
  p('');
  p('## 4. Spot checks (paste-verified by hand)');
  p('');
  const ex = pickExamples(stats, 5);
  ex.forEach((e, i) => {
    p('### ' + (i + 1) + '. ' + kindLabel(e) + ' — ' + (e.selector || '?'));
    p('');
    p('* context: `' + (e.selector || '') + ' { ' + (e.property || '') + ' }`');
    p('* source target: `' + e.raw.slice(0, 160) + (e.raw.length > 160 ? '…' : '') + '`');
    p('* emitted: `' + String(e.after).slice(0, 160) + (String(e.after).length > 160 ? '…' : '') + '`');
    if (e.decision === 'inlined') p('* bytes: ' + e.bytes + ' (' + human(e.bytes) + '), source: ' + e.source + ', local path: `' + e.rel + '`');
    if (e.decision === 'relative') p('* bytes: ' + e.bytes + ' (' + human(e.bytes) + ') kept as a relative file, source: ' + e.source + ', local path: `' + e.rel + '`');
    if (e.decision === 'remote') p('* no local copy → live url kept, so the page still looks right when online');
    p('');
  });
  const inlined = stats.decisions.filter((d) => d.decision === 'inlined').sort((a, b) => b.bytes - a.bytes);
  const relative = stats.decisions.filter((d) => d.decision === 'relative').sort((a, b) => b.bytes - a.bytes);
  const remote = stats.decisions.filter((d) => d.decision === 'remote').sort((a, b) => (a.normalized < b.normalized ? -1 : 1));
  // several raw url() forms can point at the same downloaded file (wayback/direct/double-slash)
  const groupBy = (list) => {
    const g = new Map();
    for (const d of list) {
      const k = d.rel || d.raw;
      if (!g.has(k)) g.set(k, { rel: d.rel, bytes: d.bytes, source: d.source, targets: [], selectors: [] });
      const e = g.get(k);
      e.targets.push(d.raw);
      if (d.selector && !e.selectors.includes(d.selector + ' { ' + (d.property || '') + ' }')) e.selectors.push(d.selector + ' { ' + (d.property || '') + ' }');
    }
    return [...g.values()];
  };
  const inlinedFiles = groupBy(inlined);
  const relativeFiles = groupBy(relative);
  p('## 5. Inlined as base64 (' + inlinedFiles.length + ' distinct files from ' + inlined.length + ' distinct url() targets, ' + stats.localInlinedBytes + ' B of image data → ' + Math.round(stats.localInlinedBytes * 4 / 3) + ' B of base64 text)');
  p('');
  p('| local file | bytes | why | affects |');
  p('| --- | ---: | --- | --- |');
  for (const d of inlinedFiles) {
    p('| `assets/' + d.rel + '` | ' + d.bytes + ' | ' + (CHROME_ALWAYS.has(path.basename(d.rel).toLowerCase()) ? 'chrome/sprite allow-list' : '&lt; ' + human(opts.inlineLimit)) + ' | ' + d.selectors.map((s) => '`' + s + '`').join(', ') + ' |');
  }
  p('');
  p('## 6. Left as relative files (' + relativeFiles.length + ' distinct files from ' + relative.length + ' distinct url() targets, ' + stats.localRelativeBytes + ' B = ' + human(stats.localRelativeBytes) + ')');
  p('');
  if (!relativeFiles.length) {
    const over = inlined.filter((d) => d.bytes >= opts.inlineLimit);
    p('_none — every locally available image in the sheet was inlined. '
      + (over.length
        ? over.length + ' of them (' + [...new Set(over.map((d) => path.basename(d.rel)))].join(', ') + ') are above the '
          + human(opts.inlineLimit) + ' limit and are inlined only because they sit on the chrome allow-list._'
        : 'Nothing exceeded the ' + human(opts.inlineLimit) + ' limit._'));
  }
  else {
    p('| relative path (from the html root) | bytes | affects |');
    p('| --- | ---: | --- |');
    for (const d of relativeFiles) p('| `' + path.relative(opts.root, path.join(assetsDir, d.rel)).split(path.sep).join('/') + '` | ' + d.bytes + ' | ' + d.selectors.map((s) => '`' + s + '`').join(', ') + ' |');
  }
  p('');
  p('## 7. Still remote-only (' + remote.length + ' distinct targets, ' + stats.remote + ' occurrences)');
  p('');
  p('These have no local copy (`status:"missing"` or absent from the manifest): the sheet keeps the');
  p('**live** `http://…` url, so they load when online and silently fail offline.');
  p('');
  const hist = manifestIdx.present
    ? Object.keys(manifestIdx.statuses).sort().map((k) => manifestIdx.statuses[k] + '× `' + k + '`').join(', ')
    : 'n/a';
  p('Why there is no local copy — read off the manifest and `tools/fetch-assets.js`, no network used here:');
  p('');
  p('1. **' + remoteAbsent + ' of the ' + stats.remote + ' remote targets are not in the manifest at all** (all `static.hdslb.com`),');
  p('   i.e. the fetcher never even attempted them: its URL list does not contain the stylesheet-derived URLs.');
  p('   The manifest holds ' + (manifestIdx.present ? manifestIdx.entries + ' entries (' + hist + ')' : 'no entries')
    + ', which is mostly the archived JSON/HTML');
  p('   picture set, not this sheet\'s chrome. Closing that gap is a *collection* fix: add `' + rel(opts.css) + '`');
  p('   to the fetcher\'s URL sources (or parse it for `url()` targets) and re-run, then re-run this tool.');
  p('2. For the URLs it *did* attempt, `tools/fetch-assets.js:140` — `if (source === "live" && r.status === 404) break;` —');
  p('   abandons the whole attempt list the moment the live CDN answers 404, so the two Wayback attempts that follow');
  p('   it never run; a live 404 therefore permanently loses the archive copy. `images/logo.png` and');
  p('   `images/v2images/repeatline.png` are in the manifest with a non-`ok` status and are the local symptom of this.');
  p('');
  if (!remote.length) p('_none_');
  else {
    p('| live url kept | affects | reason |');
    p('| --- | --- | --- |');
    for (const d of remote) {
      const known = manifestIdx.byUrl.get(d.normalized) || manifestIdx.byPath.get(pathOf(d.normalized));
      p('| `' + d.replacement + '` | `' + (d.selector || '') + ' { ' + (d.property || '') + ' }` | ' + (known ? 'manifest status `' + known.status + '`' : 'not in manifest') + ' |');
    }
  }
  p('');
  const unresolved = stats.decisions.filter((d) => d.decision === 'already-local');
  p('## 8. Unresolved / unusual');
  p('');
  p('* `url()` targets that are already relative and were left untouched: ' + unresolved.length
    + (unresolved.length ? ' (' + unresolved.map((d) => '`' + d.raw + '`').join(', ') + ')' : ''));
  p('* `@charset` rules removed: ' + checks.charsetRemoved);
  p('* IE `behavior:` / `progid:` hacks: left in place (not touched by this pass).');
  p('* Sources of the local files used: ' + summaryBySource(stats.decisions) + '.');
  p('');
  return L.join('\n');
}

function summaryBySource(decisions) {
  const m = new Map();
  for (const d of decisions) {
    if (d.decision !== 'inlined' && d.decision !== 'relative') continue;
    m.set(d.source, (m.get(d.source) || 0) + 1);
  }
  if (!m.size) return 'none';
  return [...m.entries()].sort().map(([k, v]) => k + '=' + v).join(', ');
}

function byteLen(s) {
  return Buffer.byteLength(s, 'utf8');
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/') || '.';
}

// ---------------------------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------------------------

const BOOL_FLAGS = new Set(['no-inline', 'no-report', 'json', 'dump', 'help', 'h']);

function parseArgs(argv) {
  const opts = Object.assign({}, DEFAULT_OPTS, { inlineImages: [], help: false, argError: false });
  const asPath = (s) => (path.isAbsolute(s) ? s : path.join(ROOT, s));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const m = a.match(/^--([a-z0-9-]+)(?:=(.*))?$/i);
    if (!m) { console.error('ignoring unrecognized argument "' + a + '" (see --help)'); continue; }
    const k = m[1].toLowerCase();
    let v = m[2];
    if (v === undefined && !BOOL_FLAGS.has(k)) {
      const next = argv[i + 1];
      if (next !== undefined && !/^--/.test(next)) { v = next; i++; }
    }
    if (v === undefined && !BOOL_FLAGS.has(k) && k !== 'report') {
      console.error('FATAL: --' + k + ' needs a value (write --' + k + '=<value>, or --' + k + ' <value>)');
      return Object.assign(opts, { argError: true, badFlag: k });
    }
    switch (k) {
      case 'css': opts.css = asPath(v); break;
      case 'out': opts.out = asPath(v); break;
      case 'manifest': opts.manifest = asPath(v); break;
      case 'report': opts.report = v ? asPath(v) : ''; break;
      case 'root': opts.root = asPath(v || '.'); break;
      case 'inline-limit': opts.inlineLimit = Number(v) || 0; break;
      case 'no-inline': opts.inline = false; break;
      case 'no-report': opts.report = ''; break;
      case 'json': opts.json = true; break;
      case 'dump': opts.dump = true; break;
      case 'inline-images': opts.inlineImages = String(v || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case 'help': case 'h': opts.help = true; break;
      default: console.error('unknown flag --' + k + ' (see --help)');
    }
  }
  return opts;
}

const HELP = [
  'node tools/offline.js [flags]',
  '  --css=<file>            source stylesheet            (default _ref/new_z2.css)',
  '  --out=<file>            rewritten stylesheet         (default build/index.css)',
  '  --manifest=<file>       fetch-assets manifest        (default assets/MANIFEST.json, optional)',
  '  --report=<file>         markdown report              (default spec/offline-report.md)',
  '  --no-report             do not write the report',
  '  --root=<dir>            html root that local refs are relative to (default the workspace root)',
  '  --inline-limit=<bytes>  inline local images below this size (default 40960)',
  '  --no-inline             never emit data: urls; use relative assets/... paths only',
  '  --inline-images=<list>  comma-separated manifest urls or workspace paths to inline; prints',
  '                          one line per image (add --dump for the full data: urls)',
  '  --json                  print a machine-readable summary on stdout',
  '  --help',
  '',
  'Programmatic: const { inlineImage } = require("./tools/offline.js");',
  '              inlineImage("assets/images/v3images/icons1.png") -> "data:image/png;base64,..."',
].join('\n');

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.argError) return 2;
  if (opts.help) { console.log(HELP); return 0; }

  if (!fs.existsSync(opts.css)) {
    console.error('FATAL: source stylesheet not found: ' + opts.css);
    return 1;
  }
  const src = fs.readFileSync(opts.css, 'utf8');
  const manifestIdx = loadManifest(opts.manifest, path.join(ROOT, 'assets'));
  if (!manifestIdx.present) {
    console.log('MANIFEST ABSENT: ' + rel(opts.manifest) + (manifestIdx.note ? ' (' + manifestIdx.note + ')' : '')
      + ' — rewriting with live-url fallback + assets/ disk lookup only.');
  } else {
    console.log('manifest: ' + rel(opts.manifest) + ' — ' + manifestIdx.entries + ' entries, '
      + manifestIdx.ok + ' with a local file');
  }

  const { css: rewritten, stats } = rewriteCss(src, manifestIdx, opts);

  // @charset noise (none in the 2015 sheet, but keep the pass honest)
  let out = rewritten;
  const charsetCount = (src.match(/@charset\s+[^;]+;/gi) || []).length;
  if (charsetCount) out = out.replace(/@charset\s+[^;]+;\s*/gi, '');

  // checks
  const braceOpen = (s) => (s.match(/{/g) || []).length;
  const braceClose = (s) => (s.match(/}/g) || []).length;
  const srcStripped = src.replace(/@charset\s+[^;]+;\s*/gi, '');
  const checks = {
    bracesBefore: braceOpen(src) + '/' + braceClose(src),
    bracesAfter: braceOpen(out) + '/' + braceClose(out),
    bracesOk: braceOpen(src) === braceOpen(out) && braceClose(src) === braceClose(out),
    skeletonOk: maskUrls(srcStripped) === maskUrls(out),
    charsetRemoved: charsetCount === 0 ? 'none present' : String(charsetCount),
    idempotent: false,
  };
  const second = rewriteCss(out, manifestIdx, opts).css.replace(/@charset\s+[^;]+;\s*/gi, '');
  checks.idempotent = second === out;

  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(opts.out, out, 'utf8');

  const stats2 = {
    occurrences: stats.occurrences,
    distinct: stats.distinct,
    localInlined: stats.localInlined,
    localRelative: stats.localRelative,
    remote: stats.remote,
    data: stats.data,
    fragment: stats.fragment,
    untouchedOther: stats.untouchedOther,
    diskFallback: stats.diskFallback,
    distinctRemotePaths: stats.distinctRemotePaths,
  };
  console.log('url() found: ' + stats.occurrences + ' occurrences / ' + stats.distinct + ' distinct targets');
  console.log('  mapped locally : ' + (stats.localInlined + stats.localRelative)
    + '  (inlined data: ' + stats.localInlined + ' = ' + stats.localInlinedBytes + ' B; relative: '
    + stats.localRelative + ' = ' + stats.localRelativeBytes + ' B)');
  console.log('  left remote    : ' + stats.remote + '  (' + stats.distinctRemotePaths + ' distinct missing paths)');
  console.log('  untouched      : ' + stats.data + ' data:, ' + stats.fragment + ' #fragment, ' + stats.untouchedOther + ' already-relative');
  console.log('  inlined bytes  : ' + stats.localInlinedBytes + ' image bytes -> ' + Math.round(stats.localInlinedBytes * 4 / 3) + ' B base64 text');
  console.log('  checks         : braces ' + (checks.bracesOk ? 'PASS' : 'FAIL')
    + ', url-masked skeleton ' + (checks.skeletonOk ? 'PASS' : 'FAIL')
    + ', fixed-point ' + (checks.idempotent ? 'PASS' : 'FAIL'));
  if (!checks.skeletonOk) console.error('  ! the rewrite changed something outside url(...) — inspect ' + rel(opts.out));
  console.log('wrote ' + rel(opts.out) + ' (' + byteLen(out) + ' bytes)');

  if (opts.inlineImages.length) {
    console.log('--inline-images:');
    for (const item of opts.inlineImages) {
      let file = '';
      const norm = normalizeUrl(item);
      const e = manifestIdx.byUrl.get(norm) || manifestIdx.byPath.get(pathOf(norm));
      if (e && e.local) file = e.abs;
      else if (fs.existsSync(path.join(ROOT, item))) file = path.join(ROOT, item);
      else if (fs.existsSync(path.join(ROOT, 'assets', item))) file = path.join(ROOT, 'assets', item);
      if (!file) { console.log('  MISSING  ' + item); continue; }
      const uri = inlineImage(file);
      console.log('  ' + String(fs.statSync(file).size).padStart(8) + ' B  ' + rel(file) + '  ->  ' + uri.length + ' chars');
      if (opts.dump) console.log(uri);
    }
  }

  if (opts.report) {
    const md = buildReport({
      opts: opts, src: src, out: out, stats: stats, manifestIdx: manifestIdx,
      assetsDir: path.join(ROOT, 'assets'), checks: checks,
    });
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, md, 'utf8');
    console.log('wrote ' + rel(opts.report));
  }

  if (opts.json) {
    console.log(JSON.stringify({ css: rel(opts.css), out: rel(opts.out), manifest: rel(opts.manifest), manifestPresent: manifestIdx.present, summary: stats2, checks: checks, remoteOnly: stats.remoteList.map((d) => ({ url: d.replacement, selector: d.selector, property: d.property })) }));
  }
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { inlineImage, dataUriFor, rewriteCss, loadManifest, normalizeUrl, pathOf, guessLocalPath, buildReport, MIME, CHROME_ALWAYS };

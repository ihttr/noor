#!/usr/bin/env node
// Downloads every candidate source listed in data/sources/sources.manifest.json,
// stores the bytes exactly as received, records SHA-256 and writes data/sources/SOURCES.lock.json.
//
// Usage (PowerShell or any shell):
//   node scripts/sources/fetch-sources.mjs                 # fetch everything
//   node scripts/sources/fetch-sources.mjs --only id1,id2  # fetch some sources, merge into the lock
//   node scripts/sources/fetch-sources.mjs --dry-run       # list what would be fetched
//   node scripts/sources/fetch-sources.mjs --relock        # no download: re-check local hashes and
//                                                          # refresh lock metadata (e.g. approvals)
//
// Approvals: a manifest file entry may carry `approval` ({ use, approvedAt, approvedBy, decisions })
// once the owner approves it; it is copied into the lock, and only approved files may be imported.
//
// Requires Node >= 22 (global fetch, zlib.crc32). No dependencies.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMembers } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES_DIR = path.join(ROOT, 'data', 'sources');
const MANIFEST = path.join(SOURCES_DIR, 'sources.manifest.json');
const LOCK = path.join(SOURCES_DIR, 'SOURCES.lock.json');
const HOST_DELAY_MS = 400;
const MAX_ATTEMPTS = 3;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const relock = args.includes('--relock');
const onlyArg = args.find((a) => a.startsWith('--only'));
const only = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : args[args.indexOf(onlyArg) + 1]).split(',')
  : null;

const sha = (algo, buf) => createHash(algo).update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/** candidate | approved (every data file approved) | partially-approved */
function approvalStatus(files) {
  if (!files.some((f) => f.approval)) return 'candidate';
  return files.filter((f) => f.role === 'data').every((f) => f.approval) ? 'approved' : 'partially-approved';
}

/** Lock paths (data/sources/...) of a manifest source's approved files, mapped to the approval. */
function approvalsByPath(source) {
  const out = new Map();
  for (const f of source.files) {
    if (!f.approval) continue;
    const dests = f.archive ? Object.values(f.archive.members) : [f.path];
    for (const d of dests) out.set(`data/sources/${d}`, f.approval);
  }
  return out;
}

/** --relock: rebuild the lock from the manifest without network access. */
async function relockOnly(manifest, previous) {
  const prevById = new Map(previous.sources.map((s) => [s.id, s]));
  const sources = [];
  for (const source of manifest.sources) {
    const prev = prevById.get(source.id);
    if (!prev) throw new Error(`--relock: source ${source.id} has never been fetched`);
    const approvals = approvalsByPath(source);
    const files = [];
    for (const pf of prev.files) {
      const actual = sha('sha256', await readFile(path.join(ROOT, pf.path)));
      if (actual !== pf.sha256) throw new Error(`--relock: local file differs from the lock: ${pf.path}`);
      const entry = { ...pf };
      delete entry.approval;
      if (approvals.has(pf.path)) entry.approval = approvals.get(pf.path);
      files.push(entry);
    }
    const meta = { ...source };
    delete meta.files;
    sources.push({ ...meta, status: approvalStatus(files), files });
  }
  return sources;
}

function lockHeader(now) {
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/sources/fetch-sources.mjs',
    generatedAt: now,
    note: 'Content sources. A file may be imported only if it carries an `approval` from the project owner; source status: candidate | partially-approved | approved. Paths are relative to the repository root. downloadedAt = first download of this exact content (same SHA-256); verifiedAt = last re-download.',
  };
}

// ---------- HTTP ----------
const lastHit = new Map();
async function download(url, userAgent) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + HOST_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastHit.set(host, Date.now());
    try {
      const res = await fetch(url, { headers: { 'User-Agent': userAgent }, redirect: 'follow' });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          buf,
          contentType: res.headers.get('content-type'),
          lastModified: res.headers.get('last-modified'),
          etag: res.headers.get('etag'),
          finalUrl: res.url,
        };
      }
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
    await sleep(1000 * attempt * attempt);
  }
  throw lastError;
}

// ---------- validation ----------
function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
function looksLikeHtml(buf) {
  const head = stripBom(buf.subarray(0, 512).toString('utf8')).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}
function lenientJson(buf) {
  // Parsing aid only (index expansion / validation); the stored bytes are never altered.
  // Some upstream files contain raw control characters inside string literals; escape them.
  const src = stripBom(buf.toString('utf8'));
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of src) {
    const code = ch.codePointAt(0);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return JSON.parse(out);
}
function validate(expect, buf) {
  const info = {};
  const ascii = (n) => buf.subarray(0, n).toString('latin1');
  switch (expect) {
    case 'zip':
      if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a ZIP archive');
      break;
    case 'pdf':
      if (ascii(5) !== '%PDF-') throw new Error('not a PDF');
      break;
    case 'sqlite':
      if (ascii(16) !== 'SQLite format 3\u0000') throw new Error('not an SQLite database');
      break;
    case 'font': {
      const v = buf.readUInt32BE(0);
      if (!(v === 0x00010000 || ascii(4) === 'OTTO' || ascii(4) === 'true')) throw new Error('not an sfnt font');
      break;
    }
    case 'json':
      JSON.parse(stripBom(buf.toString('utf8')));
      break;
    case 'json-lenient': {
      // Upstream files that are not valid JSON are kept byte-for-byte and flagged, not rejected.
      const head = stripBom(buf.subarray(0, 64).toString('utf8')).trimStart();
      if (!(head.startsWith('{') || head.startsWith('['))) throw new Error('not a JSON document');
      try {
        JSON.parse(stripBom(buf.toString('utf8')));
        info.strictJson = true;
      } catch (strictErr) {
        info.strictJson = false;
        try {
          lenientJson(buf);
        } catch (err) {
          info.parseError = `${strictErr.message} | lenient: ${err.message}`;
        }
      }
      break;
    }
    case 'xml': {
      const head = stripBom(buf.subarray(0, 256).toString('utf8')).trimStart();
      if (!head.startsWith('<') || looksLikeHtml(buf)) throw new Error('not an XML document');
      break;
    }
    case 'text':
      if (looksLikeHtml(buf)) throw new Error('expected text but got an HTML page');
      break;
    case 'html':
      if (!/<html|<!doctype/i.test(buf.subarray(0, 4096).toString('utf8'))) throw new Error('not an HTML page');
      break;
    default:
      throw new Error(`unknown expect type ${expect}`);
  }
  return info;
}

// ---------- license evidence ----------
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
function makeEvidence(pageBuf, ev) {
  const text = htmlToText(pageBuf.toString('utf8'));
  if (ev.mode === 'grep') {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const hits = [...new Set(sentences.filter((s) => ev.patterns.some((p) => s.includes(p))))];
    if (!hits.length) throw new Error('evidence: no sentence matched the patterns');
    return hits.map((s) => (s.length > 600 ? `${s.slice(0, 600)} …` : s)).join('\n') + '\n';
  }
  const start = text.indexOf(ev.start);
  if (start < 0) throw new Error(`evidence: start marker not found: ${ev.start}`);
  const endAt = text.indexOf(ev.end, start + ev.start.length);
  if (endAt < 0) throw new Error(`evidence: end marker not found: ${ev.end}`);
  const stop = (ev.endInclusive ? endAt + ev.end.length : endAt) + (ev.tail ?? 0);
  return text.slice(start, stop).trim() + '\n';
}

// ---------- main ----------
async function writeOut(relPath, buf) {
  const abs = path.join(SOURCES_DIR, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return rel(abs);
}

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const previous = await loadJson(LOCK, { sources: [] });
  const prevFiles = new Map(previous.sources.flatMap((s) => s.files.map((f) => [f.path, f])));
  const now = new Date().toISOString();
  const ua = manifest.userAgent;
  const selected = manifest.sources.filter((s) => !only || only.includes(s.id));
  if (only) {
    const unknown = only.filter((id) => !manifest.sources.some((s) => s.id === id));
    if (unknown.length) throw new Error(`unknown source id(s): ${unknown.join(', ')}`);
  }
  if (dryRun) {
    for (const s of selected) for (const f of s.files) console.log(`${s.id}\t${f.url}`);
    return;
  }
  if (relock) {
    const sources = await relockOnly(manifest, previous);
    await writeFile(LOCK, JSON.stringify({ ...lockHeader(now), sources }, null, 2) + '\n', 'utf8');
    const count = (st) => sources.filter((x) => x.status === st).length;
    console.log(
      `Relocked ${sources.length} sources (local hashes verified): ${count('approved')} approved, ` +
        `${count('partially-approved')} partially approved, ${count('candidate')} candidate.`
    );
    return;
  }

  const report = [];
  const lockSources = [];
  for (const source of selected) {
    const files = [];
    const record = (entry, extra = {}) => {
      const prev = prevFiles.get(entry.path);
      const status = !prev ? 'new' : prev.sha256 === entry.sha256 ? 'unchanged' : 'CHANGED';
      files.push({
        ...entry,
        downloadedAt: status === 'unchanged' ? prev.downloadedAt : now,
        verifiedAt: now,
        ...extra,
      });
      report.push({ id: source.id, path: entry.path, status, bytes: entry.bytes, volatile: !!extra.volatile });
    };

    // A "series" entry expands into one file per number, e.g. one JSON per surah.
    const expanded = source.files.flatMap((f) =>
      f.series
        ? Array.from({ length: f.series.to - f.series.from + 1 }, (_, i) => {
            const n = String(f.series.from + i);
            const rest = { ...f };
            delete rest.series;
            return { ...rest, url: f.url.replace('{n}', n), path: f.path.replace('{n}', n) };
          })
        : [f]
    );
    for (const f of expanded) {
      process.stdout.write(`↓ ${source.id}: ${f.url}\n`);
      const res = await download(f.url, ua);
      const info = validate(f.expect, res.buf);
      const http = {
        contentType: res.contentType,
        ...(res.lastModified ? { httpLastModified: res.lastModified } : {}),
        ...(res.etag ? { etag: res.etag } : {}),
      };
      const base = {
        url: f.url,
        role: f.role,
        ...(f.options ? { options: f.options } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
        ...(f.approval ? { approval: f.approval } : {}),
      };

      if (f.archive) {
        const archive = { url: f.url, sha256: sha('sha256', res.buf), bytes: res.buf.length };
        if (f.checksums) {
          const sums = (await download(f.checksums.url, ua)).buf.toString('utf8');
          const line = sums.split(/\r?\n/).find((l) => l.trim().endsWith(f.checksums.name));
          if (!line) throw new Error(`checksum for ${f.checksums.name} not listed in ${f.checksums.url}`);
          const expected = line.trim().split(/\s+/)[0].toLowerCase();
          const actual = sha(f.checksums.algorithm, res.buf);
          if (expected !== actual) throw new Error(`${f.checksums.algorithm} mismatch for ${f.checksums.name}`);
          archive.publishedChecksum = { url: f.checksums.url, algorithm: f.checksums.algorithm, value: expected, verified: true };
        }
        const members = extractMembers(res.buf, Object.keys(f.archive.members));
        for (const [member, dest] of Object.entries(f.archive.members)) {
          const data = members.get(member);
          const p = await writeOut(dest, data);
          record({ path: p, ...base, sha256: sha('sha256', data), bytes: data.length, archive: { ...archive, member } }, http);
        }
        continue;
      }

      if (f.evidence) {
        const excerpt = Buffer.from(makeEvidence(res.buf, f.evidence), 'utf8');
        const p = await writeOut(f.path, excerpt);
        record(
          { path: p, ...base, sha256: sha('sha256', excerpt), bytes: excerpt.length, excerptOf: { url: f.url, sha256: sha('sha256', res.buf), bytes: res.buf.length } },
          { ...http, volatile: !!f.volatile }
        );
        continue;
      }

      const p = await writeOut(f.path, res.buf);
      record({ path: p, ...base, sha256: sha('sha256', res.buf), bytes: res.buf.length, ...info }, { ...http, volatile: !!f.volatile });

      if (f.expand?.type === 'hisnmuslim') {
        const index = lenientJson(res.buf);
        const chapters = Object.values(index)[0];
        for (const ch of chapters) {
          const sub = await download(ch.TEXT, ua);
          const subInfo = validate('json-lenient', sub.buf);
          const sp = await writeOut(`${f.expand.dir}/${ch.ID}.json`, sub.buf);
          record(
            { path: sp, url: ch.TEXT, role: 'data', sha256: sha('sha256', sub.buf), bytes: sub.buf.length, ...subInfo },
            { contentType: sub.contentType, volatile: !!f.volatile }
          );
        }
        process.stdout.write(`  expanded ${chapters.length} chapters into ${f.expand.dir}\n`);
      }
    }

    const meta = { ...source };
    delete meta.files;
    lockSources.push({ ...meta, status: approvalStatus(files), files });
  }

  const merged = only
    ? [...previous.sources.filter((s) => !only.includes(s.id)), ...lockSources].sort(
        (a, b) => manifest.sources.findIndex((s) => s.id === a.id) - manifest.sources.findIndex((s) => s.id === b.id)
      )
    : lockSources;
  const lock = { ...lockHeader(now), sources: merged };
  await writeFile(LOCK, JSON.stringify(lock, null, 2) + '\n', 'utf8');

  const totals = report.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const bytes = report.reduce((n, r) => n + r.bytes, 0);
  console.log(`\nFiles: ${report.length} (${(bytes / 1048576).toFixed(1)} MB) — ${JSON.stringify(totals)}`);
  for (const r of report.filter((r) => r.status === 'CHANGED')) {
    console.log(`  ${r.volatile ? 'changed (volatile source)' : 'CHANGED'}: ${r.path}`);
  }
  console.log(`Lock written: ${rel(LOCK)}`);
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});

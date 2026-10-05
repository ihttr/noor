// Strict reader for Tanzil XML files (Quran text, translations, quran-data metadata).
//
// Quran text must never be transformed. With entities: 'reject' (the default) any attribute
// value containing '&' aborts the parse, so values are returned exactly as stored in the file.
// entities: 'decode' resolves only the predefined XML entities and numeric references
// (for translation files, which may legitimately contain e.g. &quot;).

const ATTR = /([A-Za-z_][\w.-]*)="([^"]*)"/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, ref) => {
    if (ref[0] === '#') {
      return String.fromCodePoint(ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
    }
    if (!(ref in NAMED)) throw new Error(`Unknown XML entity ${m}`);
    return NAMED[ref];
  });
}

function parseAttributes(src, entities) {
  const attrs = {};
  for (const [, name, value] of src.matchAll(ATTR)) {
    if (value.includes('&')) {
      if (entities === 'reject') throw new Error(`Entity/ampersand in attribute ${name}; refusing to decode`);
      attrs[name] = decodeEntities(value);
    } else {
      attrs[name] = value;
    }
  }
  return attrs;
}

/** Strips a UTF-8 BOM if present (the BOM is not part of any value). */
export function toText(buf) {
  const s = buf.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Returns the attribute objects of every <tagName ...> element, in document order. */
export function elements(xml, tagName, { entities = 'reject' } = {}) {
  const re = new RegExp(`<${tagName}\\b([^>]*?)/?>`, 'g');
  const out = [];
  for (const m of xml.matchAll(re)) out.push(parseAttributes(m[1], entities));
  const raw = xml.split(`<${tagName} `).length - 1 + (xml.split(`<${tagName}>`).length - 1);
  if (raw !== out.length) throw new Error(`Parsed ${out.length} <${tagName}> elements but found ${raw} tags`);
  return out;
}

/** Returns the contents of all XML comments (Tanzil stores its notice there). */
export function comments(xml) {
  return [...xml.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
}

/**
 * Parses a Tanzil Quran/translation XML document into
 * [{ index, name, ayas: [{ index, text, bismillah? }] }].
 */
export function parseQuranXml(xml, { entities = 'reject' } = {}) {
  const suras = [];
  const suraRe = /<sura\b([^>]*)>([\s\S]*?)<\/sura>/g;
  for (const m of xml.matchAll(suraRe)) {
    const attrs = parseAttributes(m[1], entities);
    const ayas = elements(m[2], 'aya', { entities }).map((a) => ({
      index: Number(a.index),
      text: a.text,
      ...(a.bismillah !== undefined ? { bismillah: a.bismillah } : {}),
    }));
    suras.push({ index: Number(attrs.index), name: attrs.name, ayas });
  }
  return suras;
}

/** Parses Tanzil quran-data.xml into plain arrays of attribute objects (numbers coerced). */
export function parseQuranData(xml) {
  const num = (o) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /^\d+$/.test(v) ? Number(v) : v]));
  const pick = (t) => elements(xml, t).map(num);
  return {
    suras: pick('sura'),
    juzs: pick('juz'),
    quarters: pick('quarter'),
    manzils: pick('manzil'),
    rukus: pick('ruku'),
    pages: pick('page'),
    sajdas: pick('sajda'),
  };
}

/** Sanity checks shared by the Phase 0 scripts (not a replacement for the Phase 2 suite). */
export function checkStructure(suras, meta) {
  const problems = [];
  if (suras.length !== 114) problems.push(`expected 114 suras, got ${suras.length}`);
  const total = suras.reduce((n, s) => n + s.ayas.length, 0);
  if (total !== 6236) problems.push(`expected 6236 ayas, got ${total}`);
  if (meta) {
    for (const s of suras) {
      const m = meta.suras.find((x) => x.index === s.index);
      if (!m) problems.push(`sura ${s.index} missing from metadata`);
      else if (m.ayas !== s.ayas.length) problems.push(`sura ${s.index}: ${s.ayas.length} ayas vs metadata ${m.ayas}`);
    }
  }
  return { total, problems };
}

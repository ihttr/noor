// Minimal, dependency-free reader for TrueType/OpenType (sfnt) fonts.
// Reads the table directory, `name` strings, `cmap` coverage and GSUB/GPOS script/feature tags.

const tag = (buf, off) => buf.toString('latin1', off, off + 4);

export function readTables(buf) {
  const version = buf.readUInt32BE(0);
  const versionTag = tag(buf, 0);
  if (!(version === 0x00010000 || versionTag === 'OTTO' || versionTag === 'true')) {
    throw new Error(`Not an sfnt font (version tag ${JSON.stringify(versionTag)})`);
  }
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    tables[tag(buf, p)] = { offset: buf.readUInt32BE(p + 8), length: buf.readUInt32BE(p + 12) };
  }
  return { flavor: versionTag === 'OTTO' ? 'CFF' : 'TrueType', tables };
}

function decodeUtf16BE(bytes) {
  const swapped = Buffer.alloc(bytes.length);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    swapped[i] = bytes[i + 1];
    swapped[i + 1] = bytes[i];
  }
  return swapped.toString('utf16le');
}

/** Returns { [nameID]: string }, preferring Windows/English, then Unicode, then Mac Roman. */
export function readNames(buf, tables) {
  const t = tables.name;
  if (!t) return {};
  const base = t.offset;
  const count = buf.readUInt16BE(base + 2);
  const strings = base + buf.readUInt16BE(base + 4);
  const rank = (platform, lang) =>
    platform === 3 && lang === 0x0409 ? 0 : platform === 3 ? 1 : platform === 0 ? 2 : 3;
  const best = {};
  for (let i = 0; i < count; i++) {
    const p = base + 6 + i * 12;
    const platform = buf.readUInt16BE(p);
    const lang = buf.readUInt16BE(p + 4);
    const nameID = buf.readUInt16BE(p + 6);
    const length = buf.readUInt16BE(p + 8);
    const offset = buf.readUInt16BE(p + 10);
    const bytes = buf.subarray(strings + offset, strings + offset + length);
    const value = platform === 1 ? bytes.toString('latin1') : decodeUtf16BE(bytes);
    const r = rank(platform, lang);
    if (!best[nameID] || r < best[nameID].r) best[nameID] = { r, value };
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.value]));
}

function cmapFormat4(buf, p, set) {
  const segX2 = buf.readUInt16BE(p + 6);
  const ends = p + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = buf.readUInt16BE(ends + s);
    const start = buf.readUInt16BE(starts + s);
    const delta = buf.readInt16BE(deltas + s);
    const ro = buf.readUInt16BE(rangeOffsets + s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph;
      if (ro === 0) glyph = (c + delta) & 0xffff;
      else {
        const g = buf.readUInt16BE(rangeOffsets + s + ro + 2 * (c - start));
        glyph = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (glyph !== 0) set.add(c);
    }
  }
}

function cmapFormat12(buf, p, set) {
  const groups = buf.readUInt32BE(p + 12);
  for (let g = 0; g < groups; g++) {
    const q = p + 16 + g * 12;
    const start = buf.readUInt32BE(q);
    const end = buf.readUInt32BE(q + 4);
    const startGlyph = buf.readUInt32BE(q + 8);
    for (let c = start; c <= end; c++) if (startGlyph + (c - start) !== 0) set.add(c);
  }
}

/** Returns the Set of code points mapped to a non-.notdef glyph by the best Unicode cmap subtable. */
export function readCmap(buf, tables) {
  const t = tables.cmap;
  if (!t) throw new Error('Font has no cmap table');
  const base = t.offset;
  const n = buf.readUInt16BE(base + 2);
  const subtables = [];
  for (let i = 0; i < n; i++) {
    const p = base + 4 + i * 8;
    const platform = buf.readUInt16BE(p);
    const encoding = buf.readUInt16BE(p + 2);
    const offset = base + buf.readUInt32BE(p + 4);
    subtables.push({ platform, encoding, offset, format: buf.readUInt16BE(offset) });
  }
  const pick =
    subtables.find((s) => s.format === 12 && (s.platform === 3 || s.platform === 0)) ||
    subtables.find((s) => s.format === 4 && s.platform === 3 && s.encoding === 1) ||
    subtables.find((s) => s.format === 4 && s.platform === 0);
  if (!pick) throw new Error('Font has no Unicode cmap subtable of format 4 or 12');
  const set = new Set();
  if (pick.format === 12) cmapFormat12(buf, pick.offset, set);
  else cmapFormat4(buf, pick.offset, set);
  return set;
}

/** Returns { scripts: string[], features: string[] } for a GSUB or GPOS table. */
export function readLayoutTags(buf, tables, which) {
  const t = tables[which];
  if (!t) return { scripts: [], features: [] };
  const base = t.offset;
  const scriptList = base + buf.readUInt16BE(base + 4);
  const featureList = base + buf.readUInt16BE(base + 6);
  const scripts = new Set();
  for (let i = 0, n = buf.readUInt16BE(scriptList); i < n; i++) scripts.add(tag(buf, scriptList + 2 + i * 6));
  const features = new Set();
  for (let i = 0, n = buf.readUInt16BE(featureList); i < n; i++) features.add(tag(buf, featureList + 2 + i * 6));
  return { scripts: [...scripts].sort(), features: [...features].sort() };
}

export function inspectFont(buf) {
  const { flavor, tables } = readTables(buf);
  return {
    flavor,
    tables: Object.keys(tables).sort(),
    names: readNames(buf, tables),
    cmap: readCmap(buf, tables),
    gsub: readLayoutTags(buf, tables, 'GSUB'),
    gpos: readLayoutTags(buf, tables, 'GPOS'),
  };
}

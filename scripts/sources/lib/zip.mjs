// Minimal, dependency-free ZIP reader (stored + deflate, no ZIP64).
// Used to extract individual members from downloaded source archives.
import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

function findEocd(buf) {
  // EOCD is at least 22 bytes; the trailing comment is at most 65535 bytes.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('ZIP: end of central directory not found');
}

/** Lists entries of a ZIP archive held in a Buffer. */
export function listZip(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`ZIP: bad central directory entry #${i}`);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc32 = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    // Bit 11 = UTF-8 names. Otherwise names are CP437; all members we use are ASCII.
    const name = rawName.toString(flags & 0x800 ? 'utf8' : 'latin1');
    entries.push({ name, method, crc32, compressedSize, size, localOffset, isDir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Extracts one entry and verifies its CRC-32. */
export function readZipEntry(buf, entry) {
  const p = entry.localOffset;
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new Error(`ZIP: bad local header for ${entry.name}`);
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  let data;
  if (entry.method === 0) data = Buffer.from(raw);
  else if (entry.method === 8) data = zlib.inflateRawSync(raw);
  else throw new Error(`ZIP: unsupported compression method ${entry.method} for ${entry.name}`);
  if (data.length !== entry.size) throw new Error(`ZIP: size mismatch for ${entry.name}`);
  if (zlib.crc32(data) !== entry.crc32) throw new Error(`ZIP: CRC-32 mismatch for ${entry.name}`);
  return data;
}

/** Returns a Map of member name -> Buffer for the requested names; throws if one is missing. */
export function extractMembers(buf, names) {
  const entries = listZip(buf);
  const out = new Map();
  for (const name of names) {
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new Error(`ZIP: member not found: ${name}`);
    out.set(name, readZipEntry(buf, entry));
  }
  return out;
}

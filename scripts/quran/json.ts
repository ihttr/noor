// Stable, review-friendly JSON for content/: objects are indented, and arrays of objects/arrays
// get one element per line, so a content change is a small, readable diff (SPEC §4).
// JSON.stringify keeps every string exact; the verifier re-reads the files to prove it.

export function stringifyContent(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) return JSON.stringify(value);
    const inner = `${indent}  `;
    return `[\n${value.map((v) => inner + JSON.stringify(v)).join(',\n')}\n${indent}]`;
  }
  if (value !== null && typeof value === 'object') {
    const inner = `${indent}  `;
    const lines = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyContent(v, inner)}`);
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

// Verifies the generated Quran content against the approved sources (SPEC §2.6).
// Usage (PowerShell or any shell):  node scripts/verify-content.ts   — exit code 1 on any failure.
import { verifyContent } from './quran/verify.ts';

const checks = await verifyContent();
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : `\nAll ${checks.length} content checks passed`);
process.exit(failed.length ? 1 : 0);

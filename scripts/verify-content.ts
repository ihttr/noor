// Verifies the generated content against the approved sources (SPEC §2.6): the Quran text and
// structure, every imported tafsir and the adhkar.
// Usage (PowerShell or any shell):  node scripts/verify-content.ts   — exit code 1 on any failure.
import { verifyContent } from './quran/verify.ts';
import { verifyAdhkar } from './adhkar/verify.ts';
import { verifyTafsir } from './tafsir/verify.ts';

const checks = [...(await verifyContent()), ...(await verifyTafsir()), ...(await verifyAdhkar())];
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(22)} ${c.detail}`);
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : `\nAll ${checks.length} content checks passed`);
process.exit(failed.length ? 1 : 0);

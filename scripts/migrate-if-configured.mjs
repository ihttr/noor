// Vercel build step (package.json "vercel-build"): applies the Prisma migrations when a database
// is configured, then the normal build runs. Without DATABASE_URL/DIRECT_URL nothing happens —
// the app works without accounts (D-063).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
  console.log('No database configured: skipping migrations (accounts and sync stay off).');
} else {
  execFileSync(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], { stdio: 'inherit' });
}

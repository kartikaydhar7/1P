// Mirrors the source prototypes into deploy/, which is the only directory the
// Vercel project uploads (its Root Directory is `deploy`). Editing a file at the
// repo root has no effect on the live site until it lands here.
//
// The two pages cross-link each other by their source filenames. deploy/ serves
// them under clean routes instead, so each copy gets its one link repointed --
// see deploy/README.md for why the filenames cannot keep their original form.
//
// Run directly with `node scripts/sync-deploy.mjs`, or let the pre-commit hook
// in .githooks/ run it for you.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => join(repoRoot, ...p);

// [source, destination, [linkFrom, linkTo]]
const PAGES = [
  ['Sprouts Agent-First v8.dc.html', 'deploy/index.html',
    ['href="Onboarding Journey.dc.html"', 'href="/onboarding"']],
  ['Onboarding Journey.dc.html', 'deploy/onboarding.html',
    ['href="Sprouts Agent-First v8.dc.html"', 'href="/"']],
];

const ASSETS = [
  ['support.js', 'deploy/support.js'],
  ['uploads/sprouts.ai-logo.png', 'deploy/uploads/sprouts.ai-logo.png'],
];

let changed = 0;

for (const [src, dest, [from, to]] of PAGES) {
  const html = readFileSync(r(src), 'utf8');
  const hits = html.split(from).length - 1;
  // A silent miss here would ship a page whose link 404s, so refuse instead.
  if (hits !== 1) {
    throw new Error(`${src}: expected exactly 1 occurrence of ${from}, found ${hits}. ` +
      `The cross-link changed shape -- update PAGES in scripts/sync-deploy.mjs.`);
  }
  const out = html.split(from).join(to);
  let prev = null;
  try { prev = readFileSync(r(dest), 'utf8'); } catch {}
  if (prev !== out) {
    mkdirSync(dirname(r(dest)), { recursive: true });
    writeFileSync(r(dest), out);
    console.log(`  synced  ${dest}`);
    changed++;
  }
}

for (const [src, dest] of ASSETS) {
  let prev = null, next = readFileSync(r(src));
  try { prev = readFileSync(r(dest)); } catch {}
  if (prev == null || !prev.equals(next)) {
    mkdirSync(dirname(r(dest)), { recursive: true });
    copyFileSync(r(src), r(dest));
    console.log(`  synced  ${dest}`);
    changed++;
  }
}

console.log(changed ? `deploy/ updated (${changed} file(s))` : 'deploy/ already up to date');

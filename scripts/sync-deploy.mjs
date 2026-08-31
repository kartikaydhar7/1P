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
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => join(repoRoot, ...p);

// [source, destination, [linkFrom, linkTo]]
const PAGES = [
  ['Sprouts Canopy v9.dc.html', 'deploy/index.html',
    ['href="Onboarding Journey.dc.html"', 'href="/onboarding"']],
  ['Onboarding Journey.dc.html', 'deploy/onboarding.html',
    ['href="Sprouts Agent-First v8.dc.html"', 'href="/"']],
];

const ASSETS = [
  ['support.js', 'deploy/support.js'],
  ['uploads/sprouts.ai-logo.png', 'deploy/uploads/sprouts.ai-logo.png'],
  ['fonts/Pliant-Variable.ttf', 'deploy/fonts/Pliant-Variable.ttf'],
  ['fonts/OFL.txt', 'deploy/fonts/OFL.txt'],
  ['assets/savant-orb.png', 'deploy/assets/savant-orb.png'],
];

// Assets the pages reference but that we knowingly cannot ship yet. Anything
// missing and NOT listed here fails the sync, because a 404 on a background
// image or a webfont is invisible in the markup and silently degrades the live
// page -- exactly how the Savant orb and the Pliant typeface went unnoticed
// across several deploys.
const KNOWN_MISSING = new Map();

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

// --- Verify every local asset a synced page references actually shipped. ---
// Covers CSS url() as well as src=/href=; the orb was referenced only from
// url(), which is why an attribute-only check never caught it.
// The lookbehind keeps JS identifiers such as URL.revokeObjectURL(url) from
// being read as a CSS url() reference.
const REF_RE = /(?:src|href)\s*=\s*"([^"]+)"|(?<![\w.])url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
// Component logic is not markup; scanning it only produces false positives.
const stripScripts = (html) => html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
const missing = new Map();
const skipped = [];

for (const [, dest] of PAGES) {
  const html = stripScripts(readFileSync(r(dest), 'utf8'));
  for (const m of html.matchAll(REF_RE)) {
    const ref = (m[1] ?? m[2] ?? '').trim();
    // Not a local file we control: remote, inline, anchors, mail, template
    // bindings, and the clean routes we deliberately rewrote links to.
    if (!ref || /^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ref)) continue;
    if (ref.includes('{{') || ref.startsWith('/')) { skipped.push(ref); continue; }
    const rel = posix.normalize(ref.replace(/^\.\//, ''));
    if (existsSync(join(dirname(r(dest)), rel))) continue;
    if (!missing.has(rel)) missing.set(rel, new Set());
    missing.get(rel).add(dest);
  }
}

const unexpected = [...missing.keys()].filter(k => !KNOWN_MISSING.has(k));
for (const [k, why] of KNOWN_MISSING) {
  if (missing.has(k)) console.warn(`  WARNING  ${k} is referenced but not shipped (${why})`);
}
if (unexpected.length) {
  throw new Error(
    'These files are referenced by the deployed pages but are missing from deploy/:\n' +
    unexpected.map(k => `  - ${k}  (used by ${[...missing.get(k)].join(', ')})`).join('\n') +
    '\nAdd each to ASSETS, or to KNOWN_MISSING with a reason if it cannot ship yet.');
}

console.log(changed ? `deploy/ updated (${changed} file(s))` : 'deploy/ already up to date');

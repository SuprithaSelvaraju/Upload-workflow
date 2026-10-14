// Compares this project folder with the verified file list in tree-manifest.txt.
//   npm run verify:tree
// Reports files that are MISSING or DIFFERENT from the verified tree, and files that are
// EXTRA (present here, not in the list: e.g. a stray copy in the wrong folder, or anything
// under public/, which is shipped to production). Line endings (CRLF/LF) are ignored.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'tree-manifest.txt');
if (!existsSync(manifestPath)) {
  console.error('tree-manifest.txt not found in the project root.');
  process.exit(2);
}

const sha = (path) => {
  const bytes = readFileSync(path);
  return createHash('sha256').update(Buffer.from(bytes.filter((b) => b !== 13))).digest('hex');
};

const expected = new Map();
for (const line of readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
  const m = /^([0-9a-f]{64})\s+(\S.*)$/.exec(line);
  if (m) expected.set(m[2], m[1]);
}

const missing = [];
const different = [];
for (const [rel, hash] of expected) {
  const full = join(root, rel);
  if (!existsSync(full)) missing.push(rel);
  else if (sha(full) !== hash) different.push(rel);
}

const walk = (dir) => {
  const base = join(root, dir);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
};
const extra = ['src', 'scripts', 'public'].flatMap(walk).filter((rel) => !expected.has(rel));

for (const f of missing) console.log(`MISSING    ${f}`);
for (const f of different) console.log(`DIFFERENT  ${f}`);
for (const f of extra) console.log(`EXTRA      ${f}${f.startsWith('public/') ? '   (public/ is shipped to production: remove)' : ''}`);

if (missing.length === 0 && different.length === 0) {
  console.log(`OK: all ${expected.size} files match the verified tree.` + (extra.length ? ` ${extra.length} extra file(s) listed above.` : ''));
  process.exit(0);
}
console.log(`\n${missing.length} missing, ${different.length} different. Re-extract slice-1.3-full-tree.zip into this folder (overwrite), then run this again.`);
process.exit(1);

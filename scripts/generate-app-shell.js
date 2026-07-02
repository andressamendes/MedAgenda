#!/usr/bin/env node
// Regenerates the auto-generated JS module list inside service-worker.js's
// APP_SHELL array by walking the real ES module import graph, starting from
// the entry points declared in index.html (script.js, and any inline
// <script type="module"> imports such as pwa.js).
//
// Usage:
//   node scripts/generate-app-shell.js          rewrite service-worker.js in place
//   node scripts/generate-app-shell.js --check  exit 1 if service-worker.js is stale

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const SERVICE_WORKER = path.join(ROOT, 'service-worker.js');

const BEGIN_MARKER = '  // AUTO-GENERATED:BEGIN (scripts/generate-app-shell.js)';
const END_MARKER = '  // AUTO-GENERATED:END';

const IMPORT_RE = /import\s+(?:[^'"]*?\bfrom\s+)?['"]([^'"]+)['"]/g;
const SCRIPT_TAG_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const SRC_ATTR_RE = /\bsrc=["']([^"']+)["']/i;
const MODULE_TYPE_RE = /\btype=["']module["']/i;

function findEntryPoints() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const entries = [];
  let match;
  while ((match = SCRIPT_TAG_RE.exec(html))) {
    const [, attrs, body] = match;
    if (!MODULE_TYPE_RE.test(attrs)) continue;
    const srcMatch = SRC_ATTR_RE.exec(attrs);
    if (srcMatch) {
      entries.push(srcMatch[1]);
    } else {
      // Inline module: resolve its own relative imports as extra entry points.
      let importMatch;
      while ((importMatch = IMPORT_RE.exec(body))) {
        if (importMatch[1].startsWith('.')) entries.push(importMatch[1]);
      }
    }
  }
  return entries;
}

// config.js is deploy-time generated from repository secrets (see
// .github/workflows/deploy.yml) and is gitignored — it never exists in a
// checkout, so it can't be walked or pre-cached from source. It's still
// fetched and opportunistically cached at runtime by the SW's normal
// cache-first fetch handler. See docs/service-worker.md for details.
const NOT_IN_REPO = new Set(['config.js']);

function resolveJsModuleGraph(entryRelPaths) {
  const visited = new Set();
  const queue = entryRelPaths.map((p) => path.normalize(p));

  while (queue.length) {
    const rel = queue.shift();
    if (visited.has(rel)) continue;
    if (NOT_IN_REPO.has(rel)) continue;
    visited.add(rel);

    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      throw new Error(`APP_SHELL generator: referenced module not found: ${rel}`);
    }

    const content = fs.readFileSync(full, 'utf8');
    let match;
    while ((match = IMPORT_RE.exec(content))) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue; // skip bare/external specifiers
      const resolved = path.normalize(path.join(path.dirname(rel), spec));
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }

  return [...visited].sort();
}

function toPosix(relPath) {
  return './' + relPath.split(path.sep).join('/');
}

function generateBlock() {
  const entries = findEntryPoints();
  const modules = resolveJsModuleGraph(entries);
  return modules.map(toPosix);
}

function renderBlock(paths) {
  const lines = paths.map((p) => `  '${p}',`);
  return [BEGIN_MARKER, ...lines, END_MARKER].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const paths = generateBlock();
  const newBlock = renderBlock(paths);

  const swSource = fs.readFileSync(SERVICE_WORKER, 'utf8');
  const beginIdx = swSource.indexOf(BEGIN_MARKER);
  const endIdx = swSource.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    console.error('APP_SHELL generator: markers not found in service-worker.js');
    process.exit(1);
  }

  const before = swSource.slice(0, beginIdx);
  const after = swSource.slice(endIdx + END_MARKER.length);
  const updated = before + newBlock + after;

  if (check) {
    if (updated !== swSource) {
      console.error(
        'service-worker.js APP_SHELL list is out of date.\n' +
        'Run `npm run build:app-shell` and commit the result.'
      );
      process.exit(1);
    }
    console.log('APP_SHELL list is up to date (' + paths.length + ' modules).');
    return;
  }

  if (updated === swSource) {
    console.log('APP_SHELL list already up to date (' + paths.length + ' modules).');
    return;
  }

  fs.writeFileSync(SERVICE_WORKER, updated);
  console.log('APP_SHELL list regenerated (' + paths.length + ' modules).');
}

main();

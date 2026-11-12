import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const srcDir = path.join(appRoot, 'src');
const outDir = path.join(appRoot, 'dist');

// Every path the site answers on. Each one gets its own index.html so the site
// works when served as plain static files (no rewrite rules needed).
const routes = [
  '',
  'download',
  'genre/podcasts-web',
  'popular-in/om',
  'playlist/37i9dQZF1CLcTo7UzL0sYK',
  'search',
  'liked',
  'artist',
  'collection',
  'full',
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Copy everything from src to dist root.
const copy = (from, to) => {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copy(source, target);
    } else {
      fs.copyFileSync(source, target);
    }
  }
};

// src/pages holds per-route html overrides; everything else is shared assets.
copy(srcDir, outDir);

const shell = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');

for (const route of routes) {
  if (!route) continue;
  const dir = path.join(outDir, route);
  fs.mkdirSync(dir, { recursive: true });
  const page = path.join(srcDir, 'pages', route.replace(/\//g, '__') + '.html');
  const html = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : shell;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

const bytes = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const full = path.join(dir, entry.name);
    return total + (entry.isDirectory() ? bytes(full) : fs.statSync(full).size);
  }, 0);

console.log(`Built ${routes.length} pages into ${path.relative(appRoot, outDir)} (${(bytes(outDir) / 1024).toFixed(0)} kB)`);

// Builds the catalog as a self-contained Next.js standalone server and mirrors
// the assets that standalone output does not copy on its own. The desktop app
// ships the result in resources/catalog and starts it on a local port.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, '..', '..', 'catalog');
const standaloneDir = path.join(catalogDir, '.next', 'standalone');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`[prepare-catalog] ${command} ${args.join(' ')} failed with code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

if (!fs.existsSync(catalogDir)) {
  console.error(`[prepare-catalog] catalog not found at ${catalogDir}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(catalogDir, 'node_modules'))) {
  console.log('[prepare-catalog] installing catalog dependencies');
  run('npm', ['install', '--no-audit', '--no-fund'], catalogDir);
}

console.log('[prepare-catalog] building catalog');
run('npm', ['run', 'build'], catalogDir);

if (!fs.existsSync(path.join(standaloneDir, 'server.js'))) {
  console.error('[prepare-catalog] standalone server.js missing - is output:"standalone" set in next.config.mjs?');
  process.exit(1);
}

// Next expects these next to the standalone server at runtime.
copyDir(path.join(catalogDir, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
copyDir(path.join(catalogDir, 'public'), path.join(standaloneDir, 'public'));

console.log('[prepare-catalog] catalog ready at', standaloneDir);

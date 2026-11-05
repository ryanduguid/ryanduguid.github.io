// Bundle the same evidence bytes that the Node service serves and hashes.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const files = {
  rateBytes: 'rates/register/series/coal-lsl-levy.json',
  methodBytes: 'service/coal-lsl-levy/methods.json',
  engineBytes: 'assets/levy.mjs',
};
const git = (...args) => execFileSync('git', ['-C', fileURLToPath(root), ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
}).trim();
let revision = null;
try {
  const changed = git('status', '--porcelain', '--untracked-files=normal', '--',
    'service/coal-lsl-levy', 'assets/levy.mjs', 'rates/register');
  revision = git('rev-parse', 'HEAD') + (changed ? '-dirty' : '');
} catch { /* An archive has no Git revision. The manifest reports null. */ }
const evidence = Object.entries(files).map(([name, path]) =>
  `export const ${name} = Buffer.from(${JSON.stringify(readFileSync(new URL(path, root)).toString('base64'))}, 'base64');`,
);
evidence.push(`export const codeRevision = ${JSON.stringify(revision)};`);
const output = new URL('../work/', import.meta.url);
mkdirSync(output, { recursive: true });
writeFileSync(new URL('worker-evidence.mjs', output), `${evidence.join('\n')}\n`);
console.log('Bundled engine, rate and method evidence.');

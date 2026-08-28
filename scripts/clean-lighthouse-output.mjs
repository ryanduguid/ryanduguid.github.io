import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workDirectory = resolve(process.cwd(), 'work');
const outputDirectory = resolve(workDirectory, 'lighthouse');

if (dirname(outputDirectory) !== workDirectory) {
  throw new Error(`Refusing to clean unexpected path: ${outputDirectory}`);
}

rmSync(outputDirectory, { recursive: true, force: true });

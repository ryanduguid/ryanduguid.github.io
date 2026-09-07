import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'work', 'lighthouse');

rmSync(outputDirectory, { recursive: true, force: true });

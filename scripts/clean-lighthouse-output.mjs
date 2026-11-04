// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'work', 'lighthouse');

rmSync(outputDirectory, { recursive: true, force: true });

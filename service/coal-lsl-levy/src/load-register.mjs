// Disk access belongs to the Node launcher. Workers receive bundled bytes.
import { readFileSync } from 'node:fs';
import { createRegister } from './register.mjs';

export function loadRegister({
  rateSeriesPath = new URL('../../../rates/register/series/coal-lsl-levy.json', import.meta.url),
  methodsPath = new URL('../methods.json', import.meta.url),
  engineModulePath = new URL('../../../assets/levy.mjs', import.meta.url),
} = {}) {
  return createRegister({
    rateBytes: readFileSync(rateSeriesPath),
    methodBytes: readFileSync(methodsPath),
    engineBytes: readFileSync(engineModulePath),
  });
}

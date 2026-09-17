// Effective-dated rate and method records the service is allowed to serve.
//
// The rate comes from the site's rates register (rates/register/), the
// method records from methods.json beside this file. Both are read as
// bytes once at start-up and hashed; the hash of the exact served bytes is
// what a response manifest cites. A reporting month is supported only when
// a verified rate row and a supported method record both cover it and the
// month is not after the rate row's source-check month. A row that has
// been checked once does not vouch for months after the check.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..', '..', '..');
export const RATE_SERIES_PATH = join(REPO_ROOT, 'rates', 'register', 'series', 'coal-lsl-levy.json');
export const METHODS_PATH = join(here, '..', 'methods.json');
export const ENGINE_MODULE_PATH = join(REPO_ROOT, 'assets', 'levy.mjs');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function monthOf(isoDate) {
  return isoDate.slice(0, 7);
}

// Does a record whose period is [period_start, period_end] (dates, end may
// be null) cover the whole of a reporting month? A record that starts
// mid-month does not cover that month.
function covers(record, month) {
  const startMonth = monthOf(record.period_start);
  if (record.period_start.slice(8) !== '01') {
    // Starts mid-month: covers only months after its start month.
    if (month <= startMonth) return false;
  } else if (month < startMonth) {
    return false;
  }
  if (record.period_end === null) return true;
  const endMonth = monthOf(record.period_end);
  const lastDay = new Date(Date.UTC(Number(record.period_end.slice(0, 4)), Number(record.period_end.slice(5, 7)), 0))
    .getUTCDate();
  if (record.period_end.slice(8) !== String(lastDay).padStart(2, '0')) {
    return month < endMonth;
  }
  return month <= endMonth;
}

function nextMonth(month) {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

export function loadRegister({
  rateSeriesPath = RATE_SERIES_PATH,
  methodsPath = METHODS_PATH,
  engineModulePath = ENGINE_MODULE_PATH,
} = {}) {
  const rateBytes = readFileSync(rateSeriesPath);
  const methodBytes = readFileSync(methodsPath);
  const engineBytes = readFileSync(engineModulePath);
  const rateSeries = JSON.parse(rateBytes.toString('utf8'));
  const methods = JSON.parse(methodBytes.toString('utf8'));
  if (rateSeries.schema_version !== 1 || rateSeries.unit !== 'percent') {
    throw new Error(`unexpected rate series shape in ${rateSeriesPath}`);
  }
  if (methods.schema_version !== 1) {
    throw new Error(`unexpected methods shape in ${methodsPath}`);
  }
  const rateRows = rateSeries.rows.filter((row) => row.status === 'verified');
  const methodRows = methods.records.filter((row) => row.service_supported === true);

  // The service caps support at the month of the latest verification, so a
  // row verified on 18 September 2026 supports months up to 2026-09 and no
  // later. This is what stops a checked-once rate being applied to every
  // month the engine can parse.
  function rateFor(month) {
    const row = rateRows.find((candidate) => covers(candidate, month));
    if (!row) return null;
    if (month > monthOf(row.verified_at)) return null;
    return row;
  }
  function methodFor(month) {
    return methodRows.find((candidate) => covers(candidate, month)) ?? null;
  }
  function isSupported(month) {
    return rateFor(month) !== null && methodFor(month) !== null;
  }
  // Enumerate supported months: from the earliest supported record start to
  // the latest verification month, keeping only months both records cover.
  function supportedMonths() {
    const starts = [...rateRows, ...methodRows].map((row) => monthOf(row.period_start)).sort();
    const ends = rateRows.map((row) => monthOf(row.verified_at)).sort();
    if (!starts.length || !ends.length) return [];
    const months = [];
    for (let month = starts[0]; month <= ends[ends.length - 1]; month = nextMonth(month)) {
      if (isSupported(month)) months.push(month);
    }
    return months;
  }
  return Object.freeze({
    rateSeries,
    rateBytes,
    rateSha256: sha256(rateBytes),
    methods,
    methodBytes,
    methodsSha256: sha256(methodBytes),
    engineSha256: sha256(engineBytes),
    rateFor,
    methodFor,
    isSupported,
    supportedMonths,
  });
}

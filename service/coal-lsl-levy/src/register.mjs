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
import { LEVY_RATE_NUMERATOR, LEVY_RATE_DENOMINATOR } from '../../../assets/levy.mjs';
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

// Is a register row's percentage the rate the engine actually applies?
//
// The engine owns the arithmetic and its rate is a compile-time constant, so
// the register cannot change the figure a response carries. It can change what
// a response CLAIMS the figure was computed at, which is worse than either
// being wrong alone: the levy stayed at 27/1000 while `rate.value_percent`
// advertised the new row. A row the engine does not implement is therefore not
// a row this service may serve.
//
// Compared exactly, as a fraction. `value` is a decimal percentage string, so
// the row's fraction is value/100 and the engine's is N/D; they agree when
// value * D equals N * 100, with both sides scaled by the row's own decimal
// places.
export function rowMatchesEngine(value) {
  if (typeof value !== 'string' || !/^[0-9]+(\.[0-9]+)?$/.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(whole + fraction);
  return scaled * BigInt(LEVY_RATE_DENOMINATOR) === BigInt(LEVY_RATE_NUMERATOR) * 100n * scale;
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
  const verifiedRows = rateSeries.rows.filter((row) => row.status === 'verified');
  // A verified row whose percentage the engine does not implement is recorded
  // and not served. Dropping the months rather than refusing to start keeps a
  // register that gains a future rate row usable for every month the engine
  // still matches, which is the honest half of what it knows.
  const rateRows = verifiedRows.filter((row) => rowMatchesEngine(row.value));
  const unimplementedRows = verifiedRows.filter((row) => !rowMatchesEngine(row.value));
  const methodRows = methods.records.filter((row) => row.service_supported === true);

  // A month is served only where the check covers the whole of it. A row read
  // on 18 September 2026 does not vouch for wages paid on 30 September, so
  // September is not served: the last served month is August. Comparing
  // months alone let part of the served range sit after the check, which is
  // the staleness this rule exists to prevent.
  function lastDayOf(month) {
    const year = Number(month.slice(0, 4));
    const index = Number(month.slice(5, 7));
    const day = new Date(Date.UTC(year, index, 0)).getUTCDate();
    return `${month}-${String(day).padStart(2, '0')}`;
  }
  function rateFor(month) {
    const row = rateRows.find((candidate) => covers(candidate, month));
    if (!row) return null;
    if (row.verified_at < lastDayOf(month)) return null;
    return row;
  }
  function methodFor(month) {
    return methodRows.find((candidate) => covers(candidate, month)) ?? null;
  }
  function isSupported(month) {
    return rateFor(month) !== null && methodFor(month) !== null;
  }
  // Enumerate supported months: from the earliest record start to the latest
  // verification month, keeping only the months both records cover. The set
  // need not be contiguous, which is why discovery publishes every month
  // rather than a first-to-last range.
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
    // The verified rows this service will not serve, because the engine
    // applies a different percentage from the one they record. Empty in a
    // consistent deployment; discovery reports it so it cannot go unnoticed.
    unimplementedRows: Object.freeze(unimplementedRows.map((row) => Object.freeze({
      row_id: row.row_id,
      value: row.value,
      period_start: row.period_start,
      engine_rate_percent: `${(LEVY_RATE_NUMERATOR * 100) / LEVY_RATE_DENOMINATOR}`,
    }))),
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

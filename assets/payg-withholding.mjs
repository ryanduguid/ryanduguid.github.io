// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

// PAYG withholding from one regular pay, under the Commissioner's Schedule 1 (Statement of formulas
// for calculating amounts to be withheld) and Schedule 8 (study and training support loans
// components) for the income year the pay is made in. 2026-27: for payments made from 1 July 2026, as
// the ATO published them on 17 June 2026, read 18 November 2026. 2021-22 to 2025-26: the withholding
// schedules instruments as made on the Federal Register of Legislation, read 19 November 2026:
// Taxation Administration Act Withholding Schedules 2021 (F2021L00779), Taxation Administration
// Withholding Schedules 2022 (F2022L00819) and 2023 (F2023L00743), and the Taxation Administration
// (Withholding Schedules) Instrument 2024 (F2024L00664), 2025 (F2025L00647, from 1 July 2025) and
// (No. 2) 2025 (F2025L01016, from 24 September 2025).

// Each row is [weekly earnings x less than, in whole dollars (0 for the top row), a, b], with a and
// b times 10,000 so the formula y = ax − b is exact in integers. Schedule 1, 'Coefficients for
// calculation of amounts to be withheld from weekly payments': scale 2 (tax-free threshold claimed)
// has none in its first band, so nothing is withheld there; scale 3 is for foreign residents. The 2021
// to 2023 instruments repeat the coefficients for payments made on or after 13 October 2020, and the
// 2024 and both 2025 instruments those of 2024.
const FROM_OCTOBER_2020 = {
  2: [[359, 0, 0], [438, 1900, 683462], [548, 2900, 1121942], [721, 2100, 683465], [865, 2190, 748369],
    [1282, 3477, 1862119], [2307, 3450, 1827504], [3461, 3900, 2865965], [0, 4700, 5635196]],
  3: [[2307, 3250, 3250], [3461, 3700, 1038462], [0, 4500, 3807692]],
};
const FROM_JULY_2024 = {
  2: [[361, 0, 0], [500, 1600, 578462], [625, 2600, 1078462], [721, 1800, 578462], [865, 1890, 643365],
    [1282, 3227, 1800385], [2596, 3200, 1765769], [3653, 3900, 3583077], [0, 4700, 6506154]],
  3: [[2596, 3000, 3000], [3653, 3700, 1817308], [0, 4500, 4740385]],
};
/** @type {Record<string, Record<number, number[][]>>} */
const SCHEDULE_1 = {
  '2026-27': {
    2: [[362, 0, 0], [538, 1500, 543462], [673, 2500, 1082135], [721, 1700, 543473], [865, 1790, 608377],
      [1282, 3227, 1851935], [2596, 3200, 1817319], [3653, 3900, 3634627], [0, 4700, 6557704]],
    3: [[2596, 3000, 3000], [3653, 3700, 1817308], [0, 4500, 4740385]],
  },
  '2025-26': FROM_JULY_2024, '2024-25': FROM_JULY_2024,
  '2023-24': FROM_OCTOBER_2020, '2022-23': FROM_OCTOBER_2020, '2021-22': FROM_OCTOBER_2020,
};

// Schedule 8, 'Study and training support loans component rates', tax-free threshold claimed or
// foreign resident. To 23 September 2025 the component was a rate per cent of the whole weekly
// earnings: nil below the first threshold, then 1%, 2% and up by half a per cent a band to 10%. Each
// year's list is the first dollar of the bands from 1%; the 2023 instrument prints the 3.5% band's end
// as '1,44.99', and the next band starts at $1,445.
const COMPONENT_RATES = [0, 100, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000];
/** @param {number[]} firsts @returns {number[][]} */
const percentBands = (firsts) => COMPONENT_RATES.map((a, band) => [firsts[band] ?? 0, a, 0]);
/** Payments from 1 July to 23 September 2025 (F2025L00647). */
const EARLY_2025_26 = percentBands([1079, 1246, 1321, 1401, 1485, 1574, 1668, 1768, 1874, 1987, 2106, 2233, 2366, 2508,
  2659, 2819, 2988, 3167]);
// From 24 September 2025 the component is marginal (F2025L01016): 15% and 17% of the weekly earnings
// above the year's thresholds, then 10% of all of them; 2026-27 the same with its thresholds.
/** @type {Record<string, number[][]>} */
const SCHEDULE_8 = {
  '2026-27': [[1337, 0, 0], [2494, 1500, 2005615], [3577, 1700, 2504527], [0, 1000, 0]],
  '2025-26': [[1288, 0, 0], [2403, 1500, 1932692], [3447, 1700, 2413462], [0, 1000, 0]],
  '2024-25': percentBands([1046, 1208, 1281, 1358, 1439, 1525, 1617, 1714, 1817, 1926, 2042, 2164, 2294, 2432, 2578, 2732,
    2896, 3070]),
  '2023-24': percentBands([991, 1144, 1213, 1286, 1363, 1445, 1531, 1623, 1721, 1824, 1933, 2049, 2172, 2303, 2441, 2587,
    2743, 2907]),
  '2022-23': percentBands([930, 1073, 1138, 1206, 1278, 1355, 1436, 1523, 1614, 1711, 1814, 1923, 2038, 2160, 2290, 2427,
    2573, 2727]),
  '2021-22': percentBands([904, 1043, 1106, 1172, 1243, 1317, 1396, 1480, 1569, 1663, 1763, 1869, 1981, 2100, 2224, 2360,
    2501, 2651]),
};

/** Pays in a year for each period this module works. */
export const PAYS = /** @type {Record<string, number>} */ ({ week: 52, fortnight: 26, month: 12 });

/** The rounded weekly amount for x in cents (whole dollars plus 99 cents): y = ax − b to the nearest
 * dollar, 50 cents up, with no preliminary rounding ('Using a formula'), never below nil.
 * @param {number[][]} rows @param {number} x cents @returns {number} whole dollars */
function weekly(rows, x) {
  const [, a, b] = /** @type {number[]} */ (rows.find(([limit]) => limit === 0 || x < limit * 100));
  // a × x is in millionths of a dollar (a times 10^4, x in cents); b times 10^4 is b × 100 of them.
  const millionths = a * x - b * 100;
  return Math.max(0, Math.floor((millionths + 500000) / 1000000));
}

/** The weekly earnings x for one pay of `earnings` cents ('Working out the weekly earnings'):
 * the pay, half a fortnight's, or 3/13 of a month's (an amount ending in 33 cents gaining a cent
 * first), with cents ignored and 99 cents added. @param {number} earnings @param {string} period */
function weeklyEarnings(earnings, period) {
  const monthly = earnings % 100 === 33 ? earnings + 1 : earnings;
  const dollars = period === 'week' ? Math.floor(earnings / 100) : period === 'fortnight'
    ? Math.floor(earnings / 200) : Math.floor((monthly * 3) / 1300);
  return dollars * 100 + 99;
}

/** The weekly amount for the pay: twice it for a fortnight, 13/3 of it to the nearest dollar for a
 * month. @param {number} amount whole dollars @param {string} period */
const forPeriod = (amount, period) => (period === 'week' ? amount : period === 'fortnight'
  ? 2 * amount : Math.floor((2 * amount * 13 + 3) / 6));

/** The amount to withhold from one pay of `earnings` cents paid each `period` ('week',
 * 'fortnight' or 'month') in income `year`, on scale 2 or 3, and the study and training support loans
 * component Schedule 8 adds when the payee has a loan, each in whole dollars. For 2025-26 the
 * component is the one from 24 September 2025, and `earlierStudyLoan` is the one before; other years
 * have none.
 * @param {number} earnings cents @param {string} period @param {number} scale 2 or 3
 * @param {boolean} studyLoan @param {string} year */
export function withholding(earnings, period, scale, studyLoan, year) {
  if (!Object.hasOwn(SCHEDULE_1, year)) throw new Error('Choose an income year from 2021-22 to 2026-27.');
  if (!Object.hasOwn(PAYS, period)) throw new Error('Choose weekly, fortnightly or monthly pay.');
  const rows = SCHEDULE_1[year][scale];
  if (!rows) throw new Error('Choose scale 2 or scale 3.');
  if (!Number.isInteger(earnings) || earnings < 0) throw new Error('Enter the pay in whole cents.');
  const x = weeklyEarnings(earnings, period);
  const tax = forPeriod(weekly(rows, x), period);
  const component = (/** @type {number[][]} */ bands) => (studyLoan ? forPeriod(weekly(bands, x), period) : 0);
  const loan = component(SCHEDULE_8[year]);
  return { tax, studyLoan: loan, total: tax + loan,
    earlierStudyLoan: year === '2025-26' ? component(EARLY_2025_26) : null };
}

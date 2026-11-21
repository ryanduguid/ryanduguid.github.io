// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// The vehicle classifier's result rows and labels, apart from the page script.

export const kg = value => `${Number(value).toLocaleString('en-AU')} kg`;
export const BODY_NAMES = { passenger: 'passenger body', 'single-cab': 'single cab ute', 'dual-cab': 'dual cab or extra cab ute',
  van: 'panel van or cargo van', other: 'another body', motorcycle: 'motor cycle' };
// The vehicle classifier's rows: each question, its answer and the working that gives it. aud formats
// dollars as the page does.
export function vehicleRows(r, f, year, aud) {
  const passengerWeight = Number(f.seats) * 68;
  const design = {
    passenger: 'Yes: a passenger body (TD 94/19)',
    'single-cab': 'Not decided here: TD 94/19 weighs a single cab ute’s appearance, marketing and specifications',
    van: 'Not decided here: TD 94/19 weighs a panel van’s appearance, marketing and specifications',
    'dual-cab': `${r.passengers ? 'Yes' : 'No'}: ${f.seats} seats × 68 kg = ${kg(passengerWeight)}, `
      + `${r.passengers ? 'more than' : 'not more than'} the ${kg(r.load - passengerWeight)} left (MT 2024)`,
  }[f.body];
  const car = r.car ? `Yes: ${kg(r.load)} is under 1 tonne and ${f.seats} seats are fewer than 9`
    : f.body === 'motorcycle' ? 'No: a motor cycle'
      : r.load >= 1000 ? `No: ${kg(r.load)} is 1 tonne or more` : `No: ${f.seats} seats are 9 or more`;
  const credit = f.credit === 'none' ? 'None claimed: the GST stays in the cost'
    : r.credit === null ? 'Not decided here: above the car limit it turns on whether the vehicle is a commercial vehicle not '
      + 'designed principally to carry passengers (LCT Act paragraph 25-1(2)(c)), which the ATO’s compliance approach does not decide'
      : `${aud(r.credit)}: the GST in the price, ${r.capApplies ? 'up to 1/11 of the car limit'
        : r.capApplies === false ? 'with no car limit cap, as it is not a car'
          : 'which is within the car limit'}`;
  const luxury = {
    'not-a-car': 'Cannot apply: not a car for luxury car tax, which needs a load under 2 tonnes and fewer than 9 seats',
    under: 'Cannot apply: the price is not over the threshold',
    over: `Can apply: the price is ${aud(r.over)} over the threshold`,
    commercial: f.body === 'van'
      ? 'Treated as a commercial vehicle: the ATO will not review a cargo or delivery van (LCTD 2023/1 paragraphs 52 and 53)'
      : `Treated as a commercial vehicle: the seats at 68 kg are less than half the ${kg(r.load - Number(f.accessories))} load at supply, `
        + 'so the ATO will not review it (LCTD 2023/1 paragraphs 55 and 56)',
    undetermined: 'Not decided here: whether it is a commercial vehicle turns on LCTD 2023/1 paragraph 13',
  }[r.luxury];
  const section = r.fbt === '47(6)' ? 'subsection 47(6)' : `paragraph ${r.fbt}`;
  const fbt = r.fbt === 'car-benefit' ? 'No exemption: a car fringe benefit'
    : r.exempt ? `Exempt under ${section}, if private use was as limited as you state`
      : `Not exempt: ${section} needs private use limited to work-related travel and minor, infrequent and irregular use`;
  const records = ['The compliance plate or specification',
    r.car ? 'a log book of 12 continuous weeks with odometer records or a record of business kilometres for an individual or partnership'
      : 'receipts for actual costs and a diary of private use',
    r.exempt ? 'evidence that private use stayed limited, such as odometer readings' : 'the records to value the fringe benefit'];
  return [['Designed load: gross vehicle mass less kerb weight', kg(r.load)], ['A car under section 995-1 of ITAA 1997', car],
    ...(r.car ? [['Designed principally to carry passengers', design]] : []),
    ['Car limit, section 40-230', r.carLimit ? `Applies: ${aud(Number(year.carLimit))}`
      : r.carLimit === null ? (f.body === 'dual-cab'
        ? 'Not decided here: MT 2024’s dual cab test is for FBT, and no ATO ruling applies it to the car limit'
        : 'Not decided here: it applies only to a car designed mainly for carrying passengers') : 'Does not apply'],
    ['GST credit, section 69-10 of the GST Act', credit],
    ...(r.carLimit || r.cost !== null ? [['First element of cost for decline in value', r.cost === null ? 'Not decided here: it turns on the GST credit' : aud(r.cost)]] : []),
    [`Luxury car tax at the ${aud(r.threshold)} threshold`, luxury], ['FBT on an employee’s private use', fbt],
    ['Records', `${records[0]}, ${records[1]}, and ${records[2]}`]];
}

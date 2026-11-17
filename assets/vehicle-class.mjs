// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: LicenseRef-Duguid-Public-Attribution-1.0

import { number, cents, ratioCents } from './money.mjs';

/** @typedef {'passenger' | 'single-cab' | 'dual-cab' | 'van' | 'other' | 'motorcycle'} VehicleBody
 * @typedef {{body: VehicleBody, seats: string, gvm: string, kerb: string, payload: string, accessories: string,
 *   modified: 'no' | 'plated' | 'unplated', cost: string, credit: 'full' | 'none',
 *   fuel: 'efficient' | 'other', use: 'limited' | 'other'}} Vehicle
 * @typedef {{carLimit: string, fuelEfficientThreshold: string, otherThreshold: string}} VehicleYear
 * @typedef {'not-a-car' | 'under' | 'over' | 'commercial' | 'undetermined'} LuxuryCar
 * @typedef {'47(6)' | '8(2)(a)(i)' | '8(2)(a)(ii)' | 'car-benefit'} VehicleFbt
 */
const VEHICLE_BODIES = ['passenger', 'single-cab', 'dual-cab', 'van', 'other', 'motorcycle'];
// MT 2024 paragraph 15 and LCTD 2023/1 paragraph 55: 68 kg for each seat, the driver's included.
const SEAT_KG = 68;

/** The designed load in kg: gross vehicle mass less basic kerb weight (MT 2024 paragraph 11),
 * or the payload the specification states, which must agree with them when both are given.
 * @param {Vehicle} vehicle */
function designedLoad(vehicle) {
  const gvm = number(vehicle.gvm, { min: 1, max: 100000, integer: true });
  const kerb = number(vehicle.kerb, { max: 100000, integer: true });
  const payload = number(vehicle.payload, { max: 100000, integer: true });
  if (!kerb && !payload) throw new Error('Enter the kerb weight or the payload.');
  if (kerb >= gvm || payload >= gvm) throw new Error('The kerb weight and the payload must each be less than the gross vehicle mass.');
  if (kerb && payload && gvm - kerb !== payload) {
    throw new Error('The payload is not the gross vehicle mass less the kerb weight: check the specification.');
  }
  return payload || gvm - kerb;
}

/** Whether a car was designed for the principal purpose of carrying passengers, as FBTAA
 * s 8(2) asks: a passenger body is (TD 94/19), and a dual cab is when its
 * seats at 68 kg outweigh the load left (MT 2024 paragraphs 14 to 16). TD 94/19 leaves every
 * other body to factors not entered here: null for a single cab ute or a panel van, whose FBT
 * exemption under s 8(2)(a)(i) does not ask, and a refusal for any other body, whose does.
 * @param {VehicleBody} body @param {number} load @param {number} seats @returns {boolean | null} */
function designedForPassengers(body, load, seats) {
  if (body === 'other') {
    throw new Error('Whether this body was designed principally to carry passengers turns on its appearance, '
      + 'marketing and specifications (TD 94/19), which this page does not weigh.');
  }
  if (body === 'dual-cab') return seats * SEAT_KG > load - seats * SEAT_KG;
  return body === 'passenger' ? true : null;
}

/** Whether the car is treated as a commercial vehicle not designed principally for passengers
 * (LCT Act s 25-1(2)(c)) under LCTD 2023/1's compliance approach, the Commissioner's view:
 * passenger bodies are unlikely to be (paragraph 50), and the ATO will not review a cargo or
 * delivery van (paragraph 53) or a ute whose seats at 68 kg are less than half its load at
 * supply, accessories then fitted included (paragraphs 55 and 56). Anything else needs
 * paragraph 13's factors.
 * @param {VehicleBody} body @param {number} load @param {number} seats
 * @returns {'passengers' | 'commercial' | 'undetermined'} */
function luxuryDesign(body, load, seats) {
  if (body === 'passenger') return 'passengers';
  if (body === 'van') return 'commercial';
  if ((body === 'single-cab' || body === 'dual-cab') && 2 * seats * SEAT_KG < load) return 'commercial';
  return 'undetermined';
}

/** Checks the choices a vehicle's form gives, before any figure is read. @param {Vehicle} vehicle */
function vehicleChoices(vehicle) {
  if (!VEHICLE_BODIES.includes(vehicle.body)) throw new Error('Choose the body type.');
  if (vehicle.modified === 'unplated') {
    throw new Error('A modified vehicle is classified on its manufacturer’s figures from the compliance plate; '
      + 'without them this page cannot classify it.');
  }
  if (!['no', 'plated'].includes(vehicle.modified)) throw new Error('Say whether the vehicle was modified.');
  if (!['full', 'none'].includes(vehicle.credit)) throw new Error('Say whether a full GST credit is claimed.');
  if (!['efficient', 'other'].includes(vehicle.fuel)) throw new Error('Choose the fuel consumption.');
  if (!['limited', 'other'].includes(vehicle.use)) throw new Error('Choose the private use you state.');
}

/** Classifies one vehicle from its manufacturer's specification for income tax, GST, luxury car
 * tax and FBT. A car is a motor vehicle, not a motor cycle, designed to carry a load under 1 tonne
 * and fewer than 9 passengers, the driver counted (ITAA 1997 s 995-1); LCT's car allows a load
 * under 2 tonnes (LCT Act s 27-1). The car limit caps the first element of cost of a car designed
 * mainly for carrying passengers, after any GST credit (s 40-230, TD 2006/40). The GST credit is
 * the GST up to 1/11 of the car limit when the price exceeds it (GST Act s 69-10), unless LCT Act
 * s 25-1(2) keeps the car from being a luxury car. LCT can apply above the threshold for the
 * car's fuel consumption (s 25-1). FBTAA s 8(2) or s 47(6) exempts an eligible vehicle whose
 * private use was limited, which the user states and the page does not test. Money rounds half up
 * to the cent.
 * @param {Vehicle} vehicle @param {VehicleYear} year the car limit and LCT thresholds, from the caller */
export function vehicleClass(vehicle, year) {
  vehicleChoices(vehicle);
  const seats = number(vehicle.seats, { min: 1, max: 99, integer: true });
  const load = designedLoad(vehicle);
  const accessories = number(vehicle.accessories, { max: 100000, integer: true });
  if (accessories >= load) throw new Error('The accessories fitted at supply must weigh less than the designed load.');
  const price = cents(vehicle.cost);
  if (price === 0) throw new Error('Enter a price above nil.');
  const limit = cents(year.carLimit);
  const threshold = cents(vehicle.fuel === 'efficient' ? year.fuelEfficientThreshold : year.otherThreshold);
  const motor = vehicle.body !== 'motorcycle';
  const car = motor && load < 1000 && seats < 9;
  const passengers = car ? designedForPassengers(vehicle.body, load, seats) : null;
  const lctCar = motor && load < 2000 && seats < 9;
  const design = lctCar ? luxuryDesign(vehicle.body, load - accessories, seats) : null;
  /** @type {LuxuryCar} */
  let luxury = 'not-a-car';
  if (design) luxury = price <= threshold ? 'under' : design === 'passengers' ? 'over' : design;
  // s 69-10(4)(a): no cap for a car that s 25-1(2) keeps from being a luxury car. LCTD 2023/1's
  // compliance approach does not decide that (paragraph 59), so only a passenger body is settled.
  const capApplies = !car ? false : design === 'passengers' ? true : null;
  const cap = ratioCents(BigInt(limit), 11n);
  const exceeds = price > limit;
  // An undecided cap leaves the credit undecided only when the price exceeds the car limit.
  const credit = vehicle.credit === 'none' ? 0n : capApplies === null && exceeds ? null
    : capApplies && exceeds ? cap : ratioCents(BigInt(price), 11n);
  // s 40-230: no ATO ruling applies MT 2024's dual cab test to the car limit, so only a passenger
  // body is settled as designed mainly for carrying passengers.
  const carLimit = !car ? false : vehicle.body === 'passenger' ? true : null;
  // The cost after the credit is the same whether or not the limit applies when it is no more than
  // the limit, so an undecided car limit still gives it there.
  const net = credit === null ? null : price - Number(credit);
  const cost = net === null || carLimit === false ? null : carLimit ? Math.min(net, limit) : net <= limit ? net : null;
  /** @type {VehicleFbt} */
  const fbt = !car ? '47(6)' : ['single-cab', 'van'].includes(vehicle.body) ? '8(2)(a)(i)' : passengers ? 'car-benefit' : '8(2)(a)(ii)';
  return { load, car, passengers, carLimit, capApplies, cap: capApplies ? Number(cap) / 100 : null,
    credit: credit === null ? null : Number(credit) / 100, cost: cost === null ? null : cost / 100, luxury,
    threshold: threshold / 100, over: luxury === 'over' ? (price - threshold) / 100 : null, fbt,
    exempt: fbt !== 'car-benefit' && vehicle.use === 'limited', belowThreshold: price < threshold };
}

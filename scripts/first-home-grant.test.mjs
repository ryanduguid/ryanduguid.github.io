// Copyright 2026 Ryan Duguid
// SPDX-License-Identifier: Apache-2.0

// For a home built, every First Home Owner Grant Act read on 24 November 2026 makes the consideration the building
// work alone (Qld schedule 'consideration' (b), WA s 14AB(b), Vic, SA and Tas s 13(7)(b), ACT s 13(6)(b), NT
// s 13(8)(b)): the land is tested against the cap but never limits the grant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { firstHomeOwnerGrant } from '../assets/first-home-owner-grant.mjs';

const include = readFileSync('_includes/calculators/first-home-owner-grant.html', 'utf8');
const facts = { person: true, citizen: true, first: true, residence: true, nt: true, tas: true };
const built = (place, value, contract) => firstHomeOwnerGrant({ place, date: '2026-08-01', home: 'built', value: String(value),
  north: false, facts: { ...facts, contract } });

test('the first home owner grant keeps the land out of a home built’s consideration', () => {
  const note = include.match(/<p class="field-note" id="first-home-owner-grant-value-note">([^<]*)<\/p>/)[1];
  assert.doesNotMatch(note, /It limits the grant/);
  assert.match(note, /Built: [^.]*; the land never limits the grant/);
  // A contract below the grant on $400,000 of land is refused, not paid in full; a $400,000 contract on land below it is.
  const paying = [['AU-NSW', 5000, 10000], ['AU-VIC', 5000, 10000], ['AU-QLD', 15000, 30000], ['AU-WA', 5000, 10000],
    ['AU-SA', 7500, 15000], ['AU-TAS', 10000, 20000], ['AU-NT', 25000, 50000]];
  for (const [place, half, amount] of paying) {
    assert.throws(() => built(place, half + 400000, false), /needs another fact stated: the building contract price is at least the grant/);
    assert.equal(built(place, 400000 + half, true).grant, amount);
  }
  // The ACT has paid none since 1 July 2019.
  assert.equal(built('AU-ACT', 405000, false).grant, 0);
});

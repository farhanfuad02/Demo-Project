/**
 * @file Unit tests for the hall lists and the gender rule over them.
 *
 * @module tests/unit/services/hall-policy
 */

import { describe, expect, it } from '@jest/globals';
import { GENDER } from '@hungry-ju/shared/enums';
import {
  ALL_HALLS,
  FEMALE_HALLS,
  MALE_HALLS,
  genderOfHall,
  hallsForGender,
  isHall,
  isHallForGender,
} from '@hungry-ju/shared/halls';
import { ValidationError } from '../../../src/core/errors/app-error.js';
import { HallPolicy } from '../../../src/services/hall-policy.js';

describe('the hall lists', () => {
  it('names eleven male halls and ten female ones', () => {
    expect(MALE_HALLS).toHaveLength(11);
    expect(FEMALE_HALLS).toHaveLength(10);
    expect(ALL_HALLS).toHaveLength(21);
  });

  it('is frozen, so a caller cannot add a hall the server would then accept', () => {
    expect(Object.isFrozen(MALE_HALLS)).toBe(true);
    expect(Object.isFrozen(FEMALE_HALLS)).toBe(true);
  });

  it('shares no code between the two lists, which is what lets a hall imply a gender', () => {
    const shared = MALE_HALLS.filter((hall) => FEMALE_HALLS.includes(hall));

    expect(shared).toEqual([]);
    expect(new Set(ALL_HALLS).size).toBe(ALL_HALLS.length);
  });

  it.each([
    ['SRJ', GENDER.MALE],
    ['ABH', GENDER.MALE],
    ['MH', GENDER.MALE],
    ['PRH', GENDER.FEMALE],
    ['J24H', GENDER.FEMALE],
    ['FZH', GENDER.FEMALE],
  ])('places %s with the %s halls', (hall, gender) => {
    expect(genderOfHall(hall)).toBe(gender);
    expect(isHall(hall)).toBe(true);
  });

  it.each([['Pritilata Hall'], ['srj'], [''], [null], [undefined]])(
    'does not recognise %p as a hall',
    (value) => {
      expect(genderOfHall(value)).toBeNull();
      expect(isHall(value)).toBe(false);
    }
  );

  it('offers a gender only its own halls', () => {
    expect(hallsForGender(GENDER.MALE)).toEqual(MALE_HALLS);
    expect(hallsForGender(GENDER.FEMALE)).toEqual(FEMALE_HALLS);
  });

  it('offers nothing at all when the gender is unknown', () => {
    // Not "everything": showing both lists would let a student pick a hall they cannot
    // live in, which is the exact mistake the split exists to prevent.
    expect(hallsForGender(null)).toEqual([]);
    expect(hallsForGender('other')).toEqual([]);
  });

  it('pairs a hall with a gender', () => {
    expect(isHallForGender('SRJ', GENDER.MALE)).toBe(true);
    expect(isHallForGender('SRJ', GENDER.FEMALE)).toBe(false);
    expect(isHallForGender('PRH', GENDER.FEMALE)).toBe(true);
    expect(isHallForGender('PRH', null)).toBe(false);
  });
});

describe('HallPolicy', () => {
  it('accepts a hall from the list that belongs to this gender', () => {
    expect(() => HallPolicy.assertMatchesGender('SRJ', GENDER.MALE)).not.toThrow();
    expect(() => HallPolicy.assertMatchesGender('BKZH', GENDER.FEMALE)).not.toThrow();
  });

  it('says nothing about an address that is simply not set yet', () => {
    expect(() => HallPolicy.assertMatchesGender(null, GENDER.MALE)).not.toThrow();
    expect(() => HallPolicy.assertMatchesGender(undefined, null)).not.toThrow();
    expect(() => HallPolicy.assertMatchesGender('', null)).not.toThrow();
  });

  it('refuses a hall from the other list, and says which ones are on offer', () => {
    expect(() => HallPolicy.assertMatchesGender('PRH', GENDER.MALE)).toThrow(ValidationError);
    expect(() => HallPolicy.assertMatchesGender('PRH', GENDER.MALE)).toThrow(/SRJ/);
  });

  it('asks for the gender first when there is none, rather than for a different hall', () => {
    expect(() => HallPolicy.assertMatchesGender('SRJ', null)).toThrow(/Set your gender/);
  });
});

/**
 * @file The residence halls of Jahangirnagar University, split by gender.
 *
 * JU's halls are gender-segregated, so a student's hall is not free text: it is one of
 * eleven halls for male students or one of ten for female students. Keeping the two lists
 * here — one module, imported by both the API's validators and the client's forms — is
 * what stops the dropdown and the server from ever disagreeing about which halls exist.
 *
 * Hall codes are the stored value. They are what students actually say and write, they
 * are stable, and using them as the identifier means a hall can later gain a longer
 * display name without a data migration.
 *
 * @module shared/halls
 */

import { GENDER } from '../enums/index.js';

/**
 * Halls for male students.
 *
 * @type {readonly string[]}
 */
export const MALE_HALLS = Object.freeze([
  'SRJ',
  'SSB',
  'SBF',
  'MBH',
  'RTH',
  'KUH',
  'KNH',
  'STUH',
  'NSH',
  'MH',
  'ABH',
]);

/**
 * Halls for female students.
 *
 * @type {readonly string[]}
 */
export const FEMALE_HALLS = Object.freeze([
  'RH',
  'TBH',
  'NFH',
  'SFH',
  'SKH',
  'PRH',
  'JIH',
  'J24H',
  'BKZH',
  'FZH',
]);

/**
 * The two lists, keyed by the gender that may choose from them.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const HALLS_BY_GENDER = Object.freeze({
  [GENDER.MALE]: MALE_HALLS,
  [GENDER.FEMALE]: FEMALE_HALLS,
});

/**
 * Every hall code, in one flat list.
 *
 * No code appears in both lists, which is what lets {@link genderOfHall} answer from the
 * hall alone and keeps the validation error precise instead of merely "unknown hall".
 *
 * @type {readonly string[]}
 */
export const ALL_HALLS = Object.freeze([...MALE_HALLS, ...FEMALE_HALLS]);

/**
 * The halls a student of this gender may choose from.
 *
 * An unknown or missing gender yields an empty list rather than every hall: the caller
 * has nothing to offer until the student says which list applies, and quietly showing
 * both would let them pick a hall they cannot live in.
 *
 * @param {string | null | undefined} gender - Student's gender.
 * @returns {readonly string[]} Hall codes, empty when the gender is not one of the two.
 */
export function hallsForGender(gender) {
  return HALLS_BY_GENDER[gender] ?? [];
}

/**
 * Which gender a hall belongs to.
 *
 * @param {string | null | undefined} hall - Hall code.
 * @returns {string | null} `male`, `female`, or `null` when the code is not a JU hall.
 */
export function genderOfHall(hall) {
  if (MALE_HALLS.includes(hall)) {
    return GENDER.MALE;
  }
  if (FEMALE_HALLS.includes(hall)) {
    return GENDER.FEMALE;
  }
  return null;
}

/**
 * Whether a hall exists at all.
 *
 * @param {string | null | undefined} hall - Hall code.
 * @returns {boolean} `true` when the code names a JU hall.
 */
export function isHall(hall) {
  return genderOfHall(hall) !== null;
}

/**
 * Whether a student of this gender may live in this hall.
 *
 * @param {string | null | undefined} hall - Hall code.
 * @param {string | null | undefined} gender - Student's gender.
 * @returns {boolean} `true` when the hall is on that gender's list.
 */
export function isHallForGender(hall, gender) {
  return hallsForGender(gender).includes(hall);
}

/**
 * @file The rule pairing a residence hall with the gender allowed to live in it.
 *
 * @module services/hall-policy
 */

import { hallsForGender, isHallForGender } from '@hungry-ju/shared/halls';
import { ValidationError } from '../core/errors/app-error.js';

/**
 * Whether a student may name a given hall.
 *
 * The rule spans two entities — gender is on the account, the hall is on the student
 * profile — so neither model can enforce it alone, and it would otherwise end up written
 * three times: once at registration, once when the address is edited, and once at
 * checkout. It lives here instead, stated once, so all three refuse the same thing with
 * the same sentence.
 *
 * Every check is a whitelist against `@hungry-ju/shared/halls`, which is also what fills
 * the client's dropdown — so the list a student is shown and the list the server accepts
 * cannot drift apart.
 */
export class HallPolicy {
  /**
   * Refuses a hall the student's gender cannot live in.
   *
   * A missing hall passes: the address is simply not set yet, and the places that require
   * one say so themselves in words that fit what the student was doing.
   *
   * @param {string | null | undefined} hall - Hall code the student named.
   * @param {string | null | undefined} gender - Gender on the account.
   * @returns {void} Returns nothing when the pairing is allowed.
   * @throws {ValidationError} When the gender is unset, or the hall belongs to the other
   *   list.
   */
  static assertMatchesGender(hall, gender) {
    if (!hall) {
      return;
    }
    const halls = hallsForGender(gender);
    if (halls.length === 0) {
      throw new ValidationError('Set your gender before choosing a hall.');
    }
    if (!isHallForGender(hall, gender)) {
      throw new ValidationError(
        `${hall} is not one of your halls. Choose from: ${halls.join(', ')}.`
      );
    }
  }
}

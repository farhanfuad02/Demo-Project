/**
 * @file Primary-key and secret-token generation.
 *
 * @module utils/identifier
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto';

/**
 * Generators for the opaque strings the system hands out.
 *
 * Grouped as static methods so the source of randomness is one import away from every
 * caller: a PIN built with `Math.random` would be guessable, and a delivery PIN is the
 * only thing standing between an honest rider and a fraud claim (BR-10).
 */
export class Identifier {
  /**
   * A primary key.
   *
   * @returns {string} RFC 4122 v4 UUID.
   */
  static uuid() {
    return randomUUID();
  }

  /**
   * A URL-safe secret, used for e-mail verification and password-reset links.
   *
   * @param {number} [byteLength] - Entropy in bytes before encoding.
   * @returns {string} Base64url token.
   */
  static token(byteLength = 32) {
    return randomBytes(byteLength).toString('base64url');
  }

  /**
   * A numeric PIN the customer reads out to confirm delivery (FR-D6).
   *
   * @param {number} [length] - Number of digits.
   * @returns {string} Zero-padded digit string.
   */
  static pin(length = 4) {
    const max = 10 ** length;
    return String(randomInt(0, max)).padStart(length, '0');
  }

  /**
   * A short, human-quotable order reference for support conversations.
   *
   * Ambiguous characters are excluded, because these get read aloud across a hall
   * corridor and `0`/`O` sound identical over the phone.
   *
   * @returns {string} Eight-character uppercase reference, e.g. `HJU-7K2M`.
   */
  static orderReference() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let index = 0; index < 4; index += 1) {
      suffix += alphabet[randomInt(0, alphabet.length)];
    }
    return `HJU-${suffix}`;
  }
}

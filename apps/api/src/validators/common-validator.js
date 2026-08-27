/**
 * @file Field-level building blocks reused by every validator.
 *
 * @module validators/common-validator
 */

import { z } from 'zod';
import { PAGINATION } from '@hungry-ju/shared/constants';

/**
 * Shared field schemas.
 *
 * Validation is a whitelist, not a filter: anything a schema does not name never reaches
 * a service, so an extra field in a request body cannot become an extra column in the
 * database. The client-side checks are there for the user's benefit; these are the ones
 * that matter (SRS section 9).
 */
export class CommonValidator {
  /**
   * A primary key as it arrives in a URL segment.
   *
   * @returns {import('zod').ZodType} Schema for an id.
   */
  static id() {
    return z.string().min(1, 'An identifier is required.');
  }

  /**
   * A Bangladeshi mobile number, in local or international form.
   *
   * @returns {import('zod').ZodType} Schema for a phone number.
   */
  static phone() {
    return z
      .string()
      .trim()
      .regex(/^(?:\+?880|0)1[3-9]\d{8}$/, 'Enter a valid Bangladeshi mobile number.');
  }

  /**
   * An e-mail address, lowercased so BR-01 uniqueness is case-insensitive.
   *
   * @returns {import('zod').ZodType} Schema for an e-mail address.
   */
  static email() {
    return z.email('Enter a valid e-mail address.').trim().toLowerCase();
  }

  /**
   * A price in taka.
   *
   * @returns {import('zod').ZodType} Schema for a price.
   */
  static price() {
    return z.coerce
      .number()
      .positive('A price must be greater than zero.')
      .max(100_000, 'That price looks wrong.');
  }

  /**
   * A quantity of items.
   *
   * @param {number} [minimum] - Smallest accepted value.
   * @returns {import('zod').ZodType} Schema for a quantity.
   */
  static quantity(minimum = 1) {
    return z.coerce
      .number()
      .int('A quantity must be a whole number.')
      .min(minimum)
      .max(50, 'That is more than a single order can carry.');
  }

  /**
   * The list-query parameters every paged endpoint accepts.
   *
   * @returns {import('zod').ZodType} Schema for pagination and sorting.
   */
  static pagination() {
    return z.object({
      page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(PAGINATION.MAX_LIMIT)
        .default(PAGINATION.DEFAULT_LIMIT),
      sortBy: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    });
  }

  /**
   * A short free-text note.
   *
   * @param {number} [maximum] - Longest accepted length.
   * @returns {import('zod').ZodType} Schema for a note.
   */
  static note(maximum = 300) {
    return z.string().trim().max(maximum).optional();
  }

  /**
   * A reason an actor must give for a destructive decision.
   *
   * @returns {import('zod').ZodType} Schema for a reason.
   */
  static reason() {
    return z.string().trim().min(3, 'Give a reason of at least 3 characters.').max(300);
  }
}

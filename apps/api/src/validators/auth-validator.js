/**
 * @file Request schemas for the authentication endpoints.
 *
 * @module validators/auth-validator
 */

import { z } from 'zod';
import { USER_ROLE } from '@hungry-ju/shared/enums';
import { CommonValidator } from './common-validator.js';

/**
 * Schemas for Epic A.
 *
 * The strength rules of FR-A3 are deliberately *not* duplicated here: `PasswordService`
 * owns them, and a second copy in a schema would drift the first time somebody changes
 * one of the two.
 */
export class AuthValidator {
  /**
   * Registration (FR-A1): a name, a credential, and at least one contact method.
   *
   * @returns {import('zod').ZodType} Schema for the registration body.
   */
  static register() {
    return (
      z
        .object({
          fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
          email: CommonValidator.email().optional(),
          phone: CommonValidator.phone().optional(),
          password: z.string().min(1, 'Choose a password.'),
          role: z.enum([USER_ROLE.STUDENT, USER_ROLE.VENDOR]).default(USER_ROLE.STUDENT),
          gender: CommonValidator.gender().optional(),
          hallName: CommonValidator.hall().optional(),
          roomNo: z.string().trim().max(40).optional(),
        })
        .refine((value) => Boolean(value.email || value.phone), {
          message: 'Give an e-mail address or a phone number.',
          path: ['email'],
        })
        // A hall without a gender cannot be checked against the right list, and the halls
        // are the one place the two fields are not independent.
        .refine((value) => !value.hallName || Boolean(value.gender), {
          message: 'Tell us your gender so we know which halls to offer.',
          path: ['gender'],
        })
    );
  }

  /**
   * Sign-in (FR-A4): whichever contact method the user remembers.
   *
   * @returns {import('zod').ZodType} Schema for the sign-in body.
   */
  static login() {
    return z.object({
      identifier: z.string().trim().min(3, 'Enter your e-mail address or phone number.'),
      password: z.string().min(1, 'Enter your password.'),
    });
  }

  /**
   * Account verification (FR-A2).
   *
   * @returns {import('zod').ZodType} Schema for the verification body.
   */
  static verify() {
    return z.object({ token: z.string().min(10, 'This verification link is not valid.') });
  }

  /**
   * Re-sending a verification link.
   *
   * @returns {import('zod').ZodType} Schema for the resend body.
   */
  static resend() {
    return z.object({ identifier: z.string().trim().min(3) });
  }

  /**
   * Starting a password reset (FR-A5).
   *
   * @returns {import('zod').ZodType} Schema for the request body.
   */
  static forgotPassword() {
    return z.object({ identifier: z.string().trim().min(3) });
  }

  /**
   * Completing a password reset (FR-A5).
   *
   * @returns {import('zod').ZodType} Schema for the reset body.
   */
  static resetPassword() {
    return z.object({
      token: z.string().min(10, 'This reset link is not valid.'),
      password: z.string().min(1, 'Choose a new password.'),
    });
  }
}

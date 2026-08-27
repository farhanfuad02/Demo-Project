/**
 * @file Request schemas for profiles and administration.
 *
 * @module validators/account-validator
 */

import { z } from 'zod';
import { AUDIT_ENTITY, ORDER_STATUS, USER_ROLE, USER_STATUS } from '@hungry-ju/shared/enums';
import { CommonValidator } from './common-validator.js';

/**
 * Schemas for FR-A8 profile editing and Epic G administration.
 */
export class AccountValidator {
  /**
   * Editing a profile (FR-A8).
   *
   * The role and the status are absent on purpose: they are not the user's to change,
   * and a whitelist that included them would be a privilege-escalation endpoint.
   *
   * @returns {import('zod').ZodType} Schema for the profile body.
   */
  static updateProfile() {
    return z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      phone: CommonValidator.phone().optional(),
      gender: z.string().trim().max(40).nullable().optional(),
      photoUrl: z.url('Enter a valid image URL.').nullable().optional(),
    });
  }

  /**
   * Editing a delivery address (FR-A8).
   *
   * @returns {import('zod').ZodType} Schema for the location body.
   */
  static updateLocation() {
    return z.object({
      hallName: z.string().trim().min(2, 'Which hall do you live in?').max(120).optional(),
      roomNo: z.string().trim().min(1, 'Which room or gate?').max(40).optional(),
    });
  }

  /**
   * The admin user directory filter (FR-G2).
   *
   * @returns {import('zod').ZodType} Schema for the directory query.
   */
  static userDirectory() {
    return CommonValidator.pagination().extend({
      role: z.enum(Object.values(USER_ROLE)).optional(),
      status: z.enum(Object.values(USER_STATUS)).optional(),
      search: z.string().trim().max(120).optional(),
    });
  }

  /**
   * Suspending or reactivating an account (FR-G2).
   *
   * @returns {import('zod').ZodType} Schema for the suspension body.
   */
  static suspendUser() {
    return z.object({
      suspended: z.boolean(),
      reason: z.string().trim().max(300).optional(),
    });
  }

  /**
   * The admin live orders monitor filter (FR-G3).
   *
   * @returns {import('zod').ZodType} Schema for the monitor query.
   */
  static orderMonitor() {
    return CommonValidator.pagination().extend({
      status: z.enum(Object.values(ORDER_STATUS)).optional(),
      stuckMinutes: z.coerce.number().int().min(1).max(240).default(20),
    });
  }

  /**
   * Force-cancelling an order in a dispute (FR-G3).
   *
   * @returns {import('zod').ZodType} Schema for the intervention body.
   */
  static resolveOrder() {
    return z.object({
      action: z.enum(['cancel', 'reassign']),
      reason: z.string().trim().max(300).optional(),
    });
  }

  /**
   * The audit log viewer filter (NFR-13).
   *
   * @returns {import('zod').ZodType} Schema for the audit query.
   */
  static auditLog() {
    return CommonValidator.pagination().extend({
      entityType: z.enum(Object.values(AUDIT_ENTITY)).optional(),
      entityId: z.string().trim().optional(),
    });
  }

  /**
   * Changing a tunable parameter (FR-G6).
   *
   * @returns {import('zod').ZodType} Schema for the settings body.
   */
  static updateSetting() {
    return z.object({
      key: z.string().trim().min(2).max(60),
      value: z.union([z.string(), z.number(), z.boolean()]),
    });
  }

  /**
   * An analytics window.
   *
   * @returns {import('zod').ZodType} Schema for the analytics query.
   */
  static analyticsWindow() {
    return z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });
  }
}

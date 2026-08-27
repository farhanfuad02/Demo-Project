/**
 * @file Request schemas for shops, menus, and discovery.
 *
 * @module validators/catalog-validator
 */

import { z } from 'zod';
import { APPROVAL_STATUS } from '@hungry-ju/shared/enums';
import { SEARCH } from '@hungry-ju/shared/constants';
import { CommonValidator } from './common-validator.js';

/**
 * Schemas for Epic B (vendor and menu) and the discovery half of Epic C.
 */
export class CatalogValidator {
  /**
   * Registering a shop (FR-B1).
   *
   * @returns {import('zod').ZodType} Schema for the registration body.
   */
  static registerShop() {
    return z.object({
      shopName: z.string().trim().min(2, 'Enter your shop name.').max(120),
      botTolaLocation: z.string().trim().min(2, 'Where in Bot Tola is your stall?').max(120),
      contactPhone: CommonValidator.phone(),
      operatingHours: z.string().trim().max(120).default(''),
      description: z.string().trim().max(500).optional(),
      photoUrl: z.url('Enter a valid image URL.').optional(),
    });
  }

  /**
   * Editing shop details.
   *
   * @returns {import('zod').ZodType} Schema for the update body.
   */
  static updateShop() {
    return z.object({
      shopName: z.string().trim().min(2).max(120).optional(),
      botTolaLocation: z.string().trim().min(2).max(120).optional(),
      contactPhone: CommonValidator.phone().optional(),
      operatingHours: z.string().trim().max(120).optional(),
      description: z.string().trim().max(500).optional(),
      photoUrl: z.url().optional(),
    });
  }

  /**
   * Opening or closing a shop (FR-B3).
   *
   * @returns {import('zod').ZodType} Schema for the status body.
   */
  static shopStatus() {
    return z.object({ isOpen: z.boolean() });
  }

  /**
   * Browsing shops (FR-C1).
   *
   * @returns {import('zod').ZodType} Schema for the browse query.
   */
  static browseShops() {
    return CommonValidator.pagination().extend({
      search: z.string().trim().max(120).optional(),
      openOnly: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional(),
    });
  }

  /**
   * Adding a menu item (FR-B2).
   *
   * @returns {import('zod').ZodType} Schema for the create body.
   */
  static createMenuItem() {
    return z.object({
      name: z.string().trim().min(2, 'Enter the dish name.').max(120),
      description: z.string().trim().max(500).optional(),
      price: CommonValidator.price(),
      category: z.string().trim().max(60).default('General'),
      photoUrl: z.url('Enter a valid image URL.').optional(),
      prepTimeMin: z.coerce.number().int().min(0).max(180).default(15),
    });
  }

  /**
   * Editing a menu item (FR-B2).
   *
   * @returns {import('zod').ZodType} Schema for the update body.
   */
  static updateMenuItem() {
    return z.object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(500).optional(),
      price: CommonValidator.price().optional(),
      category: z.string().trim().max(60).optional(),
      photoUrl: z.url().optional(),
      prepTimeMin: z.coerce.number().int().min(0).max(180).optional(),
    });
  }

  /**
   * Marking an item sold out or back in stock (FR-B2).
   *
   * @returns {import('zod').ZodType} Schema for the availability body.
   */
  static itemAvailability() {
    return z.object({ isAvailable: z.boolean() });
  }

  /**
   * Searching dishes and shops (FR-C2, FR-C3).
   *
   * @returns {import('zod').ZodType} Schema for the search query.
   */
  static search() {
    return z.object({
      q: z
        .string()
        .trim()
        .min(SEARCH.MIN_QUERY_LENGTH, `Type at least ${SEARCH.MIN_QUERY_LENGTH} characters.`)
        .max(120),
      category: z.string().trim().max(60).optional(),
      maxPrice: z.coerce.number().positive().optional(),
      openOnly: z
        .enum(['true', 'false'])
        .transform((value) => value === 'true')
        .optional(),
    });
  }

  /**
   * The admin shop queue filter (FR-G1).
   *
   * @returns {import('zod').ZodType} Schema for the queue query.
   */
  static shopQueue() {
    return CommonValidator.pagination().extend({
      status: z
        .enum([APPROVAL_STATUS.PENDING, APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED])
        .default(APPROVAL_STATUS.PENDING),
    });
  }

  /**
   * An admin decision on a shop application (FR-G1).
   *
   * @returns {import('zod').ZodType} Schema for the decision body.
   */
  static shopDecision() {
    return z
      .object({
        approved: z.boolean(),
        reason: z.string().trim().max(300).optional(),
      })
      .refine((value) => value.approved || Boolean(value.reason), {
        message: 'Tell the vendor why their application was rejected.',
        path: ['reason'],
      });
  }
}

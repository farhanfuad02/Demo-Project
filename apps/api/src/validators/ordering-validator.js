/**
 * @file Request schemas for carts, orders, deliveries, and ratings.
 *
 * @module validators/ordering-validator
 */

import { z } from 'zod';
import { DELIVERY_STATUS, ORDER_STATUS, RATING_TARGET } from '@hungry-ju/shared/enums';
import { ORDER_DEFAULTS } from '@hungry-ju/shared/constants';
import { CommonValidator } from './common-validator.js';

/**
 * Schemas for the ordering half of Epic C, and for Epics D and F.
 */
export class OrderingValidator {
  /**
   * Adding an item to the cart (FR-C4).
   *
   * @returns {import('zod').ZodType} Schema for the add body.
   */
  static addToCart() {
    return z.object({
      menuItemId: CommonValidator.id(),
      quantity: CommonValidator.quantity().default(1),
    });
  }

  /**
   * Changing a cart line (FR-C5). Zero is allowed and removes the line, which is what
   * the minus button does when it reaches one.
   *
   * @returns {import('zod').ZodType} Schema for the quantity body.
   */
  static updateCartItem() {
    return z.object({ quantity: CommonValidator.quantity(0) });
  }

  /**
   * Placing an order (FR-C6).
   *
   * @returns {import('zod').ZodType} Schema for the checkout body.
   */
  static placeOrder() {
    return z.object({
      deliveryHall: z
        .string()
        .trim()
        .min(2, 'Which hall should we deliver to?')
        .max(120)
        .optional(),
      deliveryRoom: z.string().trim().min(1, 'Which room or gate?').max(40).optional(),
      note: CommonValidator.note(),
    });
  }

  /**
   * Cancelling an order (FR-C7).
   *
   * @returns {import('zod').ZodType} Schema for the cancel body.
   */
  static cancelOrder() {
    return z.object({ reason: z.string().trim().max(300).optional() });
  }

  /**
   * Listing orders.
   *
   * @returns {import('zod').ZodType} Schema for the list query.
   */
  static listOrders() {
    return CommonValidator.pagination().extend({
      status: z.enum(Object.values(ORDER_STATUS)).optional(),
    });
  }

  /**
   * The vendor board filter (FR-B4).
   *
   * @returns {import('zod').ZodType} Schema for the board query.
   */
  static vendorBoard() {
    return CommonValidator.pagination().extend({
      statuses: z
        .string()
        .transform((value) => value.split(',').map((entry) => entry.trim()))
        .pipe(z.array(z.enum(Object.values(ORDER_STATUS))))
        .optional(),
    });
  }

  /**
   * A vendor rejecting an order (FR-B4).
   *
   * @returns {import('zod').ZodType} Schema for the rejection body.
   */
  static rejectOrder() {
    return z.object({ reason: CommonValidator.reason() });
  }

  /**
   * A vendor advancing an order (FR-B5).
   *
   * Only the two statuses a vendor actually controls are accepted; pickup and delivery
   * belong to the rider, and letting a vendor post them would make the tracking view a
   * claim rather than a record.
   *
   * @returns {import('zod').ZodType} Schema for the advance body.
   */
  static advanceOrder() {
    return z.object({
      status: z.enum([ORDER_STATUS.PREPARING, ORDER_STATUS.READY]),
    });
  }

  /**
   * A rider advancing a delivery (FR-D5).
   *
   * @returns {import('zod').ZodType} Schema for the advance body.
   */
  static advanceDelivery() {
    return z.object({
      status: z.enum([DELIVERY_STATUS.HEADING_TO_VENDOR, DELIVERY_STATUS.PICKED_UP]),
    });
  }

  /**
   * Completing a delivery with the customer's PIN (FR-D6).
   *
   * @returns {import('zod').ZodType} Schema for the completion body.
   */
  static completeDelivery() {
    return z.object({
      confirmPin: z
        .string()
        .trim()
        .regex(
          new RegExp(`^\\d{${ORDER_DEFAULTS.CONFIRM_PIN_LENGTH}}$`),
          `Enter the ${ORDER_DEFAULTS.CONFIRM_PIN_LENGTH}-digit PIN from the customer.`
        ),
    });
  }

  /**
   * Rating a shop or a delivery partner (FR-C9).
   *
   * @returns {import('zod').ZodType} Schema for the rating body.
   */
  static rate() {
    return z.object({
      targetType: z.enum([RATING_TARGET.SHOP, RATING_TARGET.RIDER]),
      stars: z.coerce.number().int().min(1).max(5),
      comment: z.string().trim().max(500).optional(),
    });
  }

  /**
   * Turning Deliver Mode on or off (FR-D1).
   *
   * @returns {import('zod').ZodType} Schema for the toggle body.
   */
  static deliverMode() {
    return z.object({ enabled: z.boolean() });
  }
}

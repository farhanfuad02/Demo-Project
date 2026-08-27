/**
 * @file Route table for `/api/search`.
 *
 * @module routes/search-router
 */

import { BaseRouter } from '../core/base-router.js';
import { ValidationMiddleware } from '../middleware/validation-middleware.js';
import { CatalogValidator } from '../validators/catalog-validator.js';

/**
 * Discovery endpoint (FR-C2, FR-C3).
 *
 * Search is open to visitors: someone deciding whether Hungry_JU is worth signing up for
 * should be able to check whether anyone sells what they want.
 *
 * @augments BaseRouter
 */
export class SearchRouter extends BaseRouter {
  /** @type {import('../controllers/shop-controller.js').ShopController} */
  #controller;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../controllers/shop-controller.js').ShopController} dependencies.shopController -
   *   Owns the search handler.
   */
  constructor({ shopController }) {
    super();
    this.#controller = shopController;
  }

  /**
   * Declares the search route.
   *
   * @param {import('express').Router} router - Router to declare routes on.
   * @returns {void}
   */
  register(router) {
    router.get(
      '/',
      ValidationMiddleware.query(CatalogValidator.search()),
      this.#controller.handle('search')
    );
  }
}

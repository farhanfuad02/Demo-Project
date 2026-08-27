/**
 * @file Abstract router: one class per resource, mounted by the application.
 *
 * @module core/base-router
 */

import { Router } from 'express';

/**
 * Abstract resource router.
 *
 * Each subclass owns one URL family and declares its routes in `register()`. Keeping
 * routing in a class lets the router receive its controller and guards by injection,
 * which is what makes the route table itself readable: every line says which guard runs
 * and which controller method answers.
 *
 * @abstract
 */
export class BaseRouter {
  /** @type {import('express').Router} */
  #router;

  /** @type {boolean} */
  #registered = false;

  /**
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor() {
    if (new.target === BaseRouter) {
      throw new TypeError('BaseRouter is abstract');
    }
    // `mergeParams` keeps `:shopId` readable from a router mounted underneath a shop.
    this.#router = Router({ mergeParams: true });
  }

  /**
   * The Express router, with every route already declared.
   *
   * Registration is lazy and happens once: `register()` calls controller methods that
   * only exist after the container has finished wiring, and mounting the same router
   * twice would double every handler.
   *
   * @returns {import('express').Router} Router ready to mount.
   */
  get router() {
    if (!this.#registered) {
      this.#registered = true;
      this.register(this.#router);
    }
    return this.#router;
  }

  /**
   * Declares this resource's routes.
   *
   * @abstract
   * @param {import('express').Router} _router - Router to declare routes on.
   * @returns {void}
   * @throws {Error} Until a subclass implements it.
   */
  register(_router) {
    throw new Error(`${this.constructor.name} must implement register()`);
  }
}

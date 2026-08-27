/**
 * @file HTTP entry for profile and Deliver Mode.
 *
 * @module controllers/user-controller
 */

import { BaseController } from '../core/base-controller.js';

/**
 * FR-A8 profile editing and FR-D1 Deliver Mode.
 *
 * @augments BaseController
 */
export class UserController extends BaseController {
  /** @type {import('../services/user-service.js').UserService} */
  #userService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../services/user-service.js').UserService} dependencies.userService -
   *   Profile rules.
   */
  constructor({ userService }) {
    super();
    this.#userService = userService;
  }

  /**
   * Returns the signed-in profile.
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async show(request, response) {
    return this.ok(response, await this.#userService.profileOf(this.actor(request)));
  }

  /**
   * Updates editable profile fields (FR-A8).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async update(request, response) {
    const profile = await this.#userService.updateProfile(this.actor(request), this.body(request));
    return this.ok(response, profile);
  }

  /**
   * Updates the delivery address (FR-A8).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async updateLocation(request, response) {
    const profile = await this.#userService.updateLocation(this.actor(request), this.body(request));
    return this.ok(response, profile);
  }

  /**
   * Turns Deliver Mode on or off (FR-D1).
   *
   * @param {import('express').Request} request - Incoming request.
   * @param {import('express').Response} response - Outgoing response.
   * @returns {Promise<import('express').Response>} The response.
   */
  async setDeliverMode(request, response) {
    const profile = await this.#userService.setDeliverMode(
      this.actor(request),
      this.body(request).enabled
    );
    return this.ok(response, profile);
  }
}

/**
 * @file The delivery lifecycle, expressed as a transition table.
 *
 * @module models/delivery-state-machine
 */

import { DELIVERY_STATUS } from '@hungry-ju/shared/enums';
import { BaseStateMachine } from '../core/base-state-machine.js';

/**
 * Legal moves of a delivery assignment (FR-D3 to FR-D6).
 *
 * `released` is reachable from every state a rider can hold but not from `picked_up`:
 * once the food is in the rider's hands, abandoning the job is a dispute for an admin,
 * not a self-service button (FR-D8, risk R8).
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const DELIVERY_TRANSITIONS = Object.freeze({
  [DELIVERY_STATUS.PENDING]: [DELIVERY_STATUS.AVAILABLE, DELIVERY_STATUS.RELEASED],
  [DELIVERY_STATUS.AVAILABLE]: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.RELEASED],
  [DELIVERY_STATUS.ASSIGNED]: [DELIVERY_STATUS.HEADING_TO_VENDOR, DELIVERY_STATUS.RELEASED],
  [DELIVERY_STATUS.HEADING_TO_VENDOR]: [DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.RELEASED],
  [DELIVERY_STATUS.PICKED_UP]: [DELIVERY_STATUS.DELIVERED],
  [DELIVERY_STATUS.DELIVERED]: [],
  [DELIVERY_STATUS.RELEASED]: [],
});

/**
 * The delivery lifecycle.
 *
 * @augments BaseStateMachine
 */
export class DeliveryStateMachine extends BaseStateMachine {
  /** @type {DeliveryStateMachine | null} */
  static #shared = null;

  /**
   * Builds a machine over the delivery transition table.
   */
  constructor() {
    super(DELIVERY_TRANSITIONS);
  }

  /**
   * The shared instance.
   *
   * @returns {DeliveryStateMachine} Singleton machine.
   */
  static get shared() {
    if (!DeliveryStateMachine.#shared) {
      DeliveryStateMachine.#shared = new DeliveryStateMachine();
    }
    return DeliveryStateMachine.#shared;
  }

  /**
   * Whether a rider holding this delivery still counts as busy (FR-D4).
   *
   * @param {string} status - Current status.
   * @returns {boolean} `true` while the assignment occupies the rider.
   */
  isActive(status) {
    return [
      DELIVERY_STATUS.ASSIGNED,
      DELIVERY_STATUS.HEADING_TO_VENDOR,
      DELIVERY_STATUS.PICKED_UP,
    ].includes(status);
  }
}

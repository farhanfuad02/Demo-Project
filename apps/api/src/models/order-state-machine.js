/**
 * @file The order lifecycle, expressed as a transition table.
 *
 * @module models/order-state-machine
 */

import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { BaseStateMachine } from '../core/base-state-machine.js';

/**
 * Legal moves of the order lifecycle (SRS section 6).
 *
 * Reading down the table is the whole specification: cancellation is reachable only from
 * `placed` and `accepted` (BR-04), rejection only from `placed`, and the three end
 * states have no successors at all.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
const ORDER_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PREPARING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.READY],
  [ORDER_STATUS.READY]: [ORDER_STATUS.PICKED_UP],
  [ORDER_STATUS.PICKED_UP]: [ORDER_STATUS.DELIVERED],
  [ORDER_STATUS.DELIVERED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.REJECTED]: [],
});

/**
 * The order lifecycle.
 *
 * A shared instance is enough: the table is immutable and holds no per-order state, so
 * every order can consult the same object.
 *
 * @augments BaseStateMachine
 */
export class OrderStateMachine extends BaseStateMachine {
  /** @type {OrderStateMachine | null} */
  static #shared = null;

  /**
   * Builds a machine over the order transition table.
   */
  constructor() {
    super(ORDER_TRANSITIONS);
  }

  /**
   * The shared instance.
   *
   * @returns {OrderStateMachine} Singleton machine.
   */
  static get shared() {
    if (!OrderStateMachine.#shared) {
      OrderStateMachine.#shared = new OrderStateMachine();
    }
    return OrderStateMachine.#shared;
  }

  /**
   * Whether an order in this state may still be cancelled by the student (BR-04).
   *
   * @param {string} status - Current status.
   * @returns {boolean} `true` while cancellation is allowed.
   */
  isCancellable(status) {
    return this.canTransition(status, ORDER_STATUS.CANCELLED);
  }

  /**
   * Whether an order in this state is finished, one way or another.
   *
   * @param {string} status - Current status.
   * @returns {boolean} `true` for delivered, cancelled, and rejected.
   */
  isFinal(status) {
    return this.isTerminal(status);
  }
}

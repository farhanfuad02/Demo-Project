/**
 * @file Abstract finite state machine backing every lifecycle in the domain.
 *
 * @module core/base-state-machine
 */

import { ConflictError } from './errors/app-error.js';

/**
 * Abstract transition table.
 *
 * The SRS calls the order status a state machine, so it is written as one instead of as
 * `if` chains scattered across services. Declaring the legal moves in a single table
 * means an illegal transition is impossible rather than merely unlikely, and the same
 * table answers the UI's question "can this order still be cancelled?".
 *
 * @abstract
 */
export class BaseStateMachine {
  /** @type {Readonly<Record<string, readonly string[]>>} */
  #transitions;

  /**
   * @param {Record<string, readonly string[]>} transitions - State to allowed next states.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor(transitions) {
    if (new.target === BaseStateMachine) {
      throw new TypeError('BaseStateMachine is abstract');
    }
    this.#transitions = Object.freeze({ ...transitions });
  }

  /**
   * States reachable in one step from the given state.
   *
   * @param {string} state - Current state.
   * @returns {readonly string[]} Allowed next states; empty for a terminal state.
   */
  nextStates(state) {
    return this.#transitions[state] ?? [];
  }

  /**
   * Whether a move is legal.
   *
   * @param {string} from - Current state.
   * @param {string} to - Proposed state.
   * @returns {boolean} `true` when the table allows the move.
   */
  canTransition(from, to) {
    return this.nextStates(from).includes(to);
  }

  /**
   * Whether a state has no successors.
   *
   * @param {string} state - State to test.
   * @returns {boolean} `true` when nothing follows it.
   */
  isTerminal(state) {
    return this.nextStates(state).length === 0;
  }

  /**
   * Asserts a move is legal before an entity applies it.
   *
   * A rejected transition is a 409 and not a 422: the request was well-formed, the
   * resource simply moved on — which is exactly what a student sees when the vendor
   * starts cooking a second before the Cancel tap lands (UC-03 alternate flow A1).
   *
   * @param {string} from - Current state.
   * @param {string} to - Proposed state.
   * @returns {void} Returns nothing when the move is legal.
   * @throws {ConflictError} When the table forbids the move.
   */
  assertTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new ConflictError(`Cannot move from "${from}" to "${to}".`);
    }
  }
}

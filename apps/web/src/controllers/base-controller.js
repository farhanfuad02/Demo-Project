/**
 * @file Abstract client-side controller: observable state plus request bookkeeping.
 *
 * @module controllers/base-controller
 */

import { ApiError } from '../services/http-client.js';

/**
 * Abstract client-side controller.
 *
 * This is the C of the client MVC. A controller owns a slice of state, calls the API,
 * builds models out of the answers, and tells its subscribers. Views read that state and
 * call these methods; they hold no fetch logic and no rules of their own, which is what
 * lets a controller be unit-tested with a fake API client and no DOM at all.
 *
 * The observer pattern here is deliberately the one React already understands:
 * `subscribe` plus an immutable state snapshot is exactly the contract
 * `useSyncExternalStore` expects, so no state library is needed to bind the two.
 *
 * @abstract
 */
export class BaseController {
  /** @type {Set<() => void>} */
  #listeners = new Set();

  /** @type {Record<string, unknown>} */
  #state;

  /** @type {import('../services/api-client.js').ApiClient} */
  #api;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   * @param {Record<string, unknown>} [initialState] - Starting state.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor(api, initialState = {}) {
    if (new.target === BaseController) {
      throw new TypeError('BaseController is abstract');
    }
    this.#api = api;
    this.#state = Object.freeze({ loading: false, error: null, ...initialState });

    // Views pass these straight to `useSyncExternalStore`, which calls them detached
    // from the instance.
    this.subscribe = this.subscribe.bind(this);
    this.getState = this.getState.bind(this);
  }

  /**
   * The API gateways, for subclasses.
   *
   * @returns {import('../services/api-client.js').ApiClient} API client.
   */
  get api() {
    return this.#api;
  }

  /**
   * The current state snapshot.
   *
   * @returns {Record<string, unknown>} Frozen state.
   */
  getState() {
    return this.#state;
  }

  /**
   * The current state snapshot.
   *
   * @returns {Record<string, unknown>} Frozen state.
   */
  get state() {
    return this.#state;
  }

  /**
   * Registers a listener.
   *
   * @param {() => void} listener - Called after every state change.
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Merges a patch into the state and notifies subscribers.
   *
   * A new frozen object is published every time rather than the old one mutated, so
   * `useSyncExternalStore` can tell "changed" from "unchanged" by identity — mutating in
   * place would leave the view showing stale data.
   *
   * @protected
   * @param {Record<string, unknown>} patch - Fields to change.
   * @returns {void}
   */
  setState(patch) {
    this.#state = Object.freeze({ ...this.#state, ...patch });
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /**
   * Runs an async operation with the loading flag and error handling around it.
   *
   * Every controller method that talks to the API goes through here, so no screen can
   * forget to clear a spinner or swallow a failure — the two bugs this pattern exists
   * to prevent.
   *
   * @protected
   * @template T
   * @param {() => Promise<T>} operation - Work to run.
   * @param {object} [options] - Behaviour.
   * @param {boolean} [options.silent] - Skip the loading flag, for a background refresh.
   * @param {boolean} [options.rethrow] - Re-throw so a caller can react to a conflict.
   * @returns {Promise<T | null>} The result, or `null` when it failed.
   */
  async run(operation, { silent = false, rethrow = false } = {}) {
    if (!silent) {
      this.setState({ loading: true, error: null });
    }
    try {
      const result = await operation();
      this.setState({ loading: false, error: null });
      return result;
    } catch (error) {
      this.setState({
        loading: false,
        error: error instanceof ApiError ? error.message : 'Something went wrong.',
        errorCode: error instanceof ApiError ? error.code : null,
        errorDetails: error instanceof ApiError ? error.details : null,
      });
      if (rethrow) {
        throw error;
      }
      return null;
    }
  }

  /**
   * Clears the current error, for a form that wants a clean slate on retry.
   *
   * @returns {void}
   */
  clearError() {
    this.setState({ error: null, errorCode: null, errorDetails: null });
  }
}

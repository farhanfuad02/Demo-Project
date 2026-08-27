/**
 * @file Background jobs: the System Scheduler actor of SRS section 3.
 *
 * @module services/scheduler-service
 */

import { BaseService } from '../core/base-service.js';

/**
 * Runs the periodic work nobody triggers by clicking.
 *
 * The SRS lists a System Scheduler as a secondary actor and BR-11 depends on it: without
 * something running on a timer, an order an unresponsive vendor never answers sits in
 * `placed` forever and the student waits with it. Jobs are ordinary service calls, so
 * each one is unit-testable without a clock.
 *
 * @augments BaseService
 */
export class SchedulerService extends BaseService {
  /** @type {import('./order-service.js').OrderService} */
  #orderService;

  /** @type {import('../repositories/auth-token-repository.js').AuthTokenRepository} */
  #authTokenRepository;

  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /** @type {number} */
  #intervalMs;

  /** @type {ReturnType<typeof setInterval> | null} */
  #timer = null;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('./order-service.js').OrderService} dependencies.orderService - Owns the
   *   auto-cancel rule.
   * @param {import('../repositories/auth-token-repository.js').AuthTokenRepository} dependencies.authTokenRepository -
   *   Expired token cleanup.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Job output.
   * @param {number} [dependencies.intervalMs] - How often to run.
   */
  constructor({ orderService, authTokenRepository, logger, intervalMs = 60_000 }) {
    super();
    this.#orderService = orderService;
    this.#authTokenRepository = authTokenRepository;
    this.#logger = logger;
    this.#intervalMs = intervalMs;
  }

  /**
   * Runs one pass of every job.
   *
   * Failures are logged rather than thrown: a scheduler that dies on the first bad tick
   * takes BR-11 with it, and silence is exactly what nobody notices.
   *
   * @returns {Promise<{ expiredOrders: number, purgedTokens: number }>} What the pass did.
   */
  async runOnce() {
    let expiredOrders = 0;
    let purgedTokens = 0;

    try {
      expiredOrders = await this.#orderService.expireUnansweredOrders();
    } catch (error) {
      this.#logger.error('Vendor accept-timeout job failed', { reason: error.message });
    }

    try {
      purgedTokens = await this.#authTokenRepository.purgeExpired();
    } catch (error) {
      this.#logger.error('Token cleanup job failed', { reason: error.message });
    }

    if (expiredOrders > 0 || purgedTokens > 0) {
      this.#logger.info('Scheduler pass complete', { expiredOrders, purgedTokens });
    }
    return { expiredOrders, purgedTokens };
  }

  /**
   * Starts the timer.
   *
   * `unref` keeps the interval from holding the process open, so a test run or a
   * `Ctrl+C` exits instead of hanging on a timer nobody is waiting for.
   *
   * @returns {void}
   */
  start() {
    if (this.#timer) {
      return;
    }
    this.#timer = setInterval(() => {
      void this.runOnce();
    }, this.#intervalMs);
    this.#timer.unref?.();
    this.#logger.info('Scheduler started', { intervalMs: this.#intervalMs });
  }

  /**
   * Stops the timer.
   *
   * @returns {void}
   */
  stop() {
    if (!this.#timer) {
      return;
    }
    clearInterval(this.#timer);
    this.#timer = null;
  }
}

/**
 * @file Admin-tunable platform parameters (FR-G6).
 *
 * @module services/settings-service
 */

import { ORDER_DEFAULTS } from '@hungry-ju/shared/constants';
import { BaseService } from '../core/base-service.js';
import { Money } from '../utils/money.js';

/**
 * Parameter names, so a typo is a missing import rather than a silently wrong default.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SETTING_KEY = Object.freeze({
  DELIVERY_FEE_BDT: 'deliveryFeeBdt',
  VENDOR_ACCEPT_TIMEOUT_SEC: 'vendorAcceptTimeoutSec',
  RELEASE_PENALTY_POINTS: 'releasePenaltyPoints',
});

/**
 * Reads and writes the tunable parameters.
 *
 * Every consumer asks this service instead of reading the constants directly, so an
 * admin raising the delivery fee during a rainy lunch peak takes effect on the next
 * order rather than on the next deployment (risk R1).
 *
 * @augments BaseService
 */
export class SettingsService extends BaseService {
  /** @type {import('../repositories/system-config-repository.js').SystemConfigRepository} */
  #systemConfigRepository;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/system-config-repository.js').SystemConfigRepository} dependencies.systemConfigRepository -
   *   Parameter storage.
   */
  constructor({ systemConfigRepository }) {
    super();
    this.#systemConfigRepository = systemConfigRepository;
  }

  /**
   * The delivery fee in force right now.
   *
   * @returns {Promise<Money>} Fee.
   */
  async deliveryFee() {
    const taka = await this.#systemConfigRepository.valueOf(
      SETTING_KEY.DELIVERY_FEE_BDT,
      ORDER_DEFAULTS.DELIVERY_FEE_BDT
    );
    return Money.fromTaka(Number(taka));
  }

  /**
   * How long a vendor has to answer an order (BR-11).
   *
   * @returns {Promise<number>} Timeout in seconds.
   */
  async vendorAcceptTimeoutSeconds() {
    return Number(
      await this.#systemConfigRepository.valueOf(
        SETTING_KEY.VENDOR_ACCEPT_TIMEOUT_SEC,
        ORDER_DEFAULTS.VENDOR_ACCEPT_TIMEOUT_SEC
      )
    );
  }

  /**
   * Reliability points a rider loses for releasing an accepted order (FR-D8).
   *
   * @returns {Promise<number>} Penalty points.
   */
  async releasePenaltyPoints() {
    return Number(
      await this.#systemConfigRepository.valueOf(SETTING_KEY.RELEASE_PENALTY_POINTS, 5)
    );
  }

  /**
   * Every parameter with its effective value, for the admin config screen.
   *
   * Defaults are merged in, so the screen shows what the system is actually using
   * rather than only the keys somebody has already overridden.
   *
   * @returns {Promise<Record<string, unknown>>} Effective settings.
   */
  async all() {
    const stored = await this.#systemConfigRepository.all();
    return {
      [SETTING_KEY.DELIVERY_FEE_BDT]: ORDER_DEFAULTS.DELIVERY_FEE_BDT,
      [SETTING_KEY.VENDOR_ACCEPT_TIMEOUT_SEC]: ORDER_DEFAULTS.VENDOR_ACCEPT_TIMEOUT_SEC,
      [SETTING_KEY.RELEASE_PENALTY_POINTS]: 5,
      ...stored,
    };
  }

  /**
   * Writes one parameter.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Admin making the change.
   * @param {string} key - Parameter name.
   * @param {unknown} value - New value.
   * @returns {Promise<Record<string, unknown>>} The effective settings after the change.
   */
  async set(actor, key, value) {
    await this.#systemConfigRepository.put(key, value, actor.id);
    return this.all();
  }
}

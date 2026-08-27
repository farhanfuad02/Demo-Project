/**
 * @file Abstract root of the client-side models.
 *
 * @module models/base-view-model
 */

/**
 * Abstract client-side model.
 *
 * The server sends plain JSON; a view needs answers like "can this still be cancelled?"
 * and "how much did this line come to?". Wrapping the payload in a class puts those
 * answers next to the data instead of scattering them through JSX, which is what keeps
 * the view layer presentational (React standard: one component, one responsibility).
 *
 * These are read models. They never write — that is the controller's job through the
 * API client — so nothing here can drift out of step with the server's own rules.
 *
 * @abstract
 */
export class BaseViewModel {
  /** @type {Record<string, unknown>} */
  #raw;

  /**
   * @param {Record<string, unknown>} raw - Payload as it arrived from the API.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor(raw) {
    if (new.target === BaseViewModel) {
      throw new TypeError('BaseViewModel is abstract');
    }
    this.#raw = raw ?? {};
  }

  /**
   * The underlying payload, for a field no accessor has been added for yet.
   *
   * @returns {Record<string, unknown>} The raw object.
   */
  get raw() {
    return this.#raw;
  }

  /**
   * Primary key.
   *
   * @returns {string} Identifier.
   */
  get id() {
    return /** @type {string} */ (this.#raw.id);
  }

  /**
   * Builds a list of models from a list of payloads, tolerating a missing list.
   *
   * @template {BaseViewModel} T
   * @this {new (raw: Record<string, unknown>) => T}
   * @param {unknown[]} [rows] - Payloads.
   * @returns {T[]} Models.
   */
  static listFrom(rows) {
    return Array.isArray(rows) ? rows.map((row) => new this(row)) : [];
  }

  /**
   * Builds a model, or `null` when there is no payload — which is what the API sends
   * for "no active delivery" and "vendor has not registered a shop yet".
   *
   * @template {BaseViewModel} T
   * @this {new (raw: Record<string, unknown>) => T}
   * @param {unknown} [row] - Payload.
   * @returns {T | null} Model, or `null`.
   */
  static maybeFrom(row) {
    return row ? new this(/** @type {Record<string, unknown>} */ (row)) : null;
  }
}

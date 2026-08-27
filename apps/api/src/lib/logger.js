/**
 * @file Structured application logger.
 *
 * @module lib/logger
 */

/** Field names whose values are replaced before a line is written. */
const SECRET_KEYS = Object.freeze([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'pin',
  'confirmPin',
  'confirm_pin',
  'confirmPinHash',
  'confirm_pin_hash',
]);

/** Ordering used to decide whether a line clears the configured threshold. */
const LEVEL_RANK = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

/**
 * Structured logger with secret redaction.
 *
 * Lines are JSON so a hosted log viewer can filter on them, and every line passes
 * through `redact` first: an audit trail that quietly records password hashes is worse
 * than no audit trail, and the one place to prevent that is on the way out.
 */
export class Logger {
  /** @type {string} */
  #level;

  /** @type {Record<string, unknown>} */
  #context;

  /** @type {Console} */
  #sink;

  /**
   * @param {object} [options] - Logger configuration.
   * @param {string} [options.level] - Lowest level that gets written.
   * @param {Record<string, unknown>} [options.context] - Fields added to every line.
   * @param {Console} [options.sink] - Output target; swapped for a spy in tests.
   */
  constructor({ level = 'info', context = {}, sink = console } = {}) {
    this.#level = level;
    this.#context = context;
    this.#sink = sink;
  }

  /**
   * Derives a logger that stamps extra fields on every line, such as a request id.
   *
   * @param {Record<string, unknown>} context - Fields to add.
   * @returns {Logger} A new logger; this one is unchanged.
   */
  child(context) {
    return new Logger({
      level: this.#level,
      context: { ...this.#context, ...context },
      sink: this.#sink,
    });
  }

  /**
   * Replaces the value of any secret-looking field, at any depth.
   *
   * @param {unknown} value - Value about to be logged.
   * @returns {unknown} A copy safe to write.
   */
  static redact(value) {
    if (Array.isArray(value)) {
      return value.map((entry) => Logger.redact(entry));
    }
    if (value === null || typeof value !== 'object' || value instanceof Date) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SECRET_KEYS.includes(key) ? '[redacted]' : Logger.redact(entry),
      ])
    );
  }

  /**
   * Writes a line when the level clears the threshold.
   *
   * @param {'debug' | 'info' | 'warn' | 'error'} level - Severity.
   * @param {string} message - What happened.
   * @param {import('@hungry-ju/shared/types').LogMeta} [meta] - Structured context.
   * @returns {void}
   */
  log(level, message, meta = {}) {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.#level]) {
      return;
    }
    const line = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...Logger.redact({ ...this.#context, ...meta }),
    };
    const method = level === 'debug' ? 'log' : level;
    this.#sink[method](JSON.stringify(line));
  }

  /**
   * Writes a debug line.
   *
   * @param {string} message - What happened.
   * @param {import('@hungry-ju/shared/types').LogMeta} [meta] - Structured context.
   * @returns {void}
   */
  debug(message, meta) {
    this.log('debug', message, meta);
  }

  /**
   * Writes an info line.
   *
   * @param {string} message - What happened.
   * @param {import('@hungry-ju/shared/types').LogMeta} [meta] - Structured context.
   * @returns {void}
   */
  info(message, meta) {
    this.log('info', message, meta);
  }

  /**
   * Writes a warning line.
   *
   * @param {string} message - What happened.
   * @param {import('@hungry-ju/shared/types').LogMeta} [meta] - Structured context.
   * @returns {void}
   */
  warn(message, meta) {
    this.log('warn', message, meta);
  }

  /**
   * Writes an error line.
   *
   * @param {string} message - What happened.
   * @param {import('@hungry-ju/shared/types').LogMeta} [meta] - Structured context.
   * @returns {void}
   */
  error(message, meta) {
    this.log('error', message, meta);
  }
}

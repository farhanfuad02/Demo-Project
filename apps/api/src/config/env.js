/**
 * @file Environment configuration: loading, validation, and typed access.
 *
 * @module config/env
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the API package root, used to resolve `.env` and the data file. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Typed, validated access to process configuration.
 *
 * Secrets are read here and nowhere else, so no service ever reaches into `process.env`
 * and no test has to set a global to run. The class fails loudly at boot when a required
 * production secret is missing: a JWT signing key that silently defaults would let the
 * whole system run with a publicly known secret.
 */
export class Env {
  /** @type {Env | null} */
  static #instance = null;

  /** @type {Record<string, string>} */
  #values;

  /**
   * @param {Record<string, string | undefined>} source - Raw variables, normally `process.env`.
   */
  constructor(source) {
    this.#values = Object.freeze({ ...source });
    this.#assertProductionSecrets();
  }

  /**
   * The process-wide configuration, loading `.env` on first access.
   *
   * @returns {Env} The singleton.
   */
  static get current() {
    if (!Env.#instance) {
      Env.#instance = new Env({ ...Env.#readEnvFile(), ...process.env });
    }
    return Env.#instance;
  }

  /**
   * Replaces the singleton; tests use it to run against a fixed configuration.
   *
   * @param {Record<string, string | undefined>} source - Variables to use instead.
   * @returns {Env} The installed configuration.
   */
  static configure(source) {
    Env.#instance = new Env(source);
    return Env.#instance;
  }

  /**
   * Reads `.env` from the API package root, if present.
   *
   * Values already in the real environment win, so a deployment platform's injected
   * secrets are never shadowed by a file that happened to be copied into the image.
   *
   * @returns {Record<string, string>} Parsed file contents; empty when there is no file.
   */
  static #readEnvFile() {
    const path = resolve(PACKAGE_ROOT, '.env');
    if (!existsSync(path)) {
      return {};
    }
    /** @type {Record<string, string>} */
    const parsed = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator === -1) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      parsed[key] = value.replace(/^["']|["']$/g, '');
    }
    return parsed;
  }

  /**
   * Refuses to boot a production process on development defaults.
   *
   * @returns {void}
   * @throws {Error} When a required secret is missing in production.
   */
  #assertProductionSecrets() {
    if (this.#values.NODE_ENV !== 'production') {
      return;
    }
    const required = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
    const missing = required.filter((key) => !this.#values[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  /**
   * Reads a string variable.
   *
   * @param {string} key - Variable name.
   * @param {string} [fallback] - Value used when unset.
   * @returns {string} The value.
   */
  string(key, fallback = '') {
    return this.#values[key] ?? fallback;
  }

  /**
   * Reads a numeric variable.
   *
   * @param {string} key - Variable name.
   * @param {number} fallback - Value used when unset or unparsable.
   * @returns {number} The value.
   */
  number(key, fallback) {
    const parsed = Number(this.#values[key]);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Reads a boolean variable, treating only `true` and `1` as true.
   *
   * @param {string} key - Variable name.
   * @param {boolean} [fallback] - Value used when unset.
   * @returns {boolean} The value.
   */
  boolean(key, fallback = false) {
    const raw = this.#values[key];
    if (raw === undefined) {
      return fallback;
    }
    return raw === 'true' || raw === '1';
  }

  /**
   * Deployment environment name.
   *
   * @returns {string} For example `development`, `test`, or `production`.
   */
  get nodeEnv() {
    return this.string('NODE_ENV', 'development');
  }

  /**
   * Whether this process runs in production.
   *
   * @returns {boolean} `true` in production.
   */
  get isProduction() {
    return this.nodeEnv === 'production';
  }

  /**
   * Whether this process runs under the test runner.
   *
   * @returns {boolean} `true` in tests.
   */
  get isTest() {
    return this.nodeEnv === 'test';
  }

  /**
   * Port the HTTP server listens on.
   *
   * @returns {number} TCP port.
   */
  get port() {
    return this.number('PORT', 4000);
  }

  /**
   * Browser origins allowed to call the API with credentials.
   *
   * @returns {string[]} Allowed origins.
   */
  get corsOrigins() {
    return this.string('CORS_ORIGINS', 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  /**
   * Base URL of the web client, used to build verification and reset links.
   *
   * @returns {string} Origin without a trailing slash.
   */
  get webAppUrl() {
    return this.string('WEB_APP_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  /**
   * File the JSON database persists to.
   *
   * @returns {string} Absolute path.
   */
  get databaseFile() {
    const configured = this.string('DATABASE_FILE');
    return configured ? resolve(configured) : resolve(PACKAGE_ROOT, 'data', 'hungry-ju.json');
  }

  /**
   * Signing key for access tokens.
   *
   * @returns {string} Secret.
   */
  get jwtAccessSecret() {
    return this.string('JWT_ACCESS_SECRET', 'hungry-ju-development-access-secret');
  }

  /**
   * Signing key for refresh tokens. Distinct from the access key so a leaked access
   * secret cannot be used to mint long-lived sessions.
   *
   * @returns {string} Secret.
   */
  get jwtRefreshSecret() {
    return this.string('JWT_REFRESH_SECRET', 'hungry-ju-development-refresh-secret');
  }

  /**
   * Lowest log level written.
   *
   * @returns {string} Level name.
   */
  get logLevel() {
    return this.string('LOG_LEVEL', this.isTest ? 'silent' : 'info');
  }

  /**
   * Whether outbound mail is written to the log instead of sent.
   *
   * The MVP has no SMTP budget, so verification links are printed by default and the
   * flow stays demonstrable without a mail provider (constraint: budget about zero).
   *
   * @returns {boolean} `true` when mail is logged rather than delivered.
   */
  get mailToConsole() {
    return this.boolean('MAIL_TO_CONSOLE', !this.isProduction);
  }
}

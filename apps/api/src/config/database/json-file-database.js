/**
 * @file File-backed storage: the in-memory store plus durability.
 *
 * @module config/database/json-file-database
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { InMemoryDatabase } from './in-memory-database.js';

/**
 * The in-memory store, persisted to a JSON file.
 *
 * The MVP has a zero budget and no managed database (SRS section 2.4), and a capstone
 * demo that needs a running PostgreSQL before it will start is a demo that fails on the
 * examiner's laptop. Reads and writes stay in memory — the file is only durability — so
 * response times are unaffected and the storage seam (`Database`) is unchanged for the
 * Phase 2 swap.
 *
 * @augments InMemoryDatabase
 */
export class JsonFileDatabase extends InMemoryDatabase {
  /** @type {string} */
  #filePath;

  /** @type {boolean} */
  #writeScheduled = false;

  /**
   * @param {string} filePath - Absolute path of the JSON file to read and write.
   */
  constructor(filePath) {
    super();
    this.#filePath = filePath;
  }

  /**
   * Path of the backing file.
   *
   * @returns {string} Absolute path.
   */
  get filePath() {
    return this.#filePath;
  }

  /**
   * Loads the file if it exists, then makes sure every table is present.
   *
   * A corrupt file is a hard failure rather than a silent reset: quietly starting with
   * an empty database would look like "all my orders vanished" to whoever is demoing.
   *
   * @returns {Promise<this>} The connected database.
   * @throws {Error} When the file exists but cannot be parsed.
   */
  async connect() {
    await super.connect();
    if (!existsSync(this.#filePath)) {
      return this;
    }
    const raw = readFileSync(this.#filePath, 'utf8').trim();
    if (raw === '') {
      return this;
    }
    try {
      this.load(JSON.parse(raw));
    } catch (error) {
      throw new Error(`Database file ${this.#filePath} is not valid JSON: ${error.message}`);
    }
    return this;
  }

  /**
   * Flushes pending writes and closes.
   *
   * @returns {Promise<void>} Resolves once the file is written.
   */
  async disconnect() {
    this.flush();
    await super.disconnect();
  }

  /**
   * Queues a write for the end of the current tick.
   *
   * Placing an order touches several tables; without coalescing, one checkout would
   * rewrite the whole file five times.
   *
   * @protected
   * @returns {void}
   */
  onChange() {
    if (this.#writeScheduled) {
      return;
    }
    this.#writeScheduled = true;
    queueMicrotask(() => {
      this.#writeScheduled = false;
      this.flush();
    });
  }

  /**
   * Writes the dataset now.
   *
   * The write goes to a temporary file that is then renamed, because a process killed
   * halfway through a direct write leaves a truncated file that cannot be parsed at all.
   *
   * @returns {void}
   */
  flush() {
    const directory = dirname(this.#filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
    const temporaryPath = `${this.#filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, this.#filePath);
  }
}

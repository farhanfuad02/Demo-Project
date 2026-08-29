/**
 * @file Public surface of the shared package.
 *
 * Both the Express API and the Next.js client import enumerations and constants from
 * here, so a status string or a policy number is defined exactly once for the whole
 * system. Re-exporting from one module keeps import paths short and stable.
 *
 * @module shared
 */

export * from './enums/index.js';
export * from './constants/index.js';
export * from './halls/index.js';

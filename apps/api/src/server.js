/**
 * @file Process entry point: connect, listen, shut down cleanly.
 *
 * @module server
 */

import { Application } from './app.js';
import { Env } from './config/env.js';
import { JsonFileDatabase } from './config/database/json-file-database.js';
import { Logger } from './lib/logger.js';

/**
 * Boots the API.
 *
 * The signal handlers matter more than they look: the JSON store coalesces writes into a
 * microtask, so a process killed without a flush can lose the last few seconds of
 * orders. Closing the application writes them out first.
 *
 * @returns {Promise<void>} Resolves once the server is listening.
 */
async function main() {
  const env = Env.current;
  const logger = new Logger({ level: env.logLevel });

  const db = new JsonFileDatabase(env.databaseFile);
  await db.connect();
  logger.info('Database ready', { file: db.filePath });

  const application = new Application({ db, env });
  await application.listen();

  /**
   * Closes everything and exits.
   *
   * @param {string} signal - Signal that triggered the shutdown.
   * @returns {Promise<void>} Resolves once the process is ready to exit.
   */
  const shutdown = async (signal) => {
    logger.info('Shutting down', { signal });
    try {
      await application.close();
      process.exit(0);
    } catch (error) {
      logger.error('Failed to shut down cleanly', { reason: error.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  // Nothing is wired up yet at this point, so this is the one place a bare console
  // write is the right answer.
  console.error('Failed to start the Hungry_JU API:', error);
  process.exit(1);
});

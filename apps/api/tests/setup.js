/**
 * @file Test bootstrap for the API suite.
 *
 * @module tests/setup
 */

import { Env } from '../src/config/env.js';

// Pinning the configuration keeps the suite from depending on whatever `.env` happens to
// be on the machine running it, and keeps log output out of the test report.
Env.configure({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  WEB_APP_URL: 'http://localhost:3000',
});

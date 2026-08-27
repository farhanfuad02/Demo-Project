/**
 * @file Jest configuration for the whole workspace.
 *
 * @module jest.config
 */

/**
 * Two projects, because the two applications are different runtimes.
 *
 * Both run as native ES modules — the source is ESM, and transpiling it to CommonJS just
 * to test it would mean the code under test is not quite the code that ships. That needs
 * `--experimental-vm-modules`, which the `test` script passes.
 *
 * Every class is tested through its constructor rather than through module mocking:
 * services take repositories, controllers take services, and each one can be handed a
 * fake. That is the payoff of the dependency injection in `Container` — with it, tests
 * need no database, no network, and no mock framework.
 *
 * @type {import('jest').Config}
 */
const config = {
  projects: [
    {
      displayName: 'api',
      rootDir: '<rootDir>/apps/api',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      transform: {},
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    },
    {
      displayName: 'web',
      rootDir: '<rootDir>/apps/web',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.js'],
      transform: {},
    },
  ],
  collectCoverageFrom: [
    'apps/*/src/**/*.js',
    'packages/*/src/**/*.js',
    '!apps/web/src/app/**',
    '!apps/api/src/server.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov'],
};

export default config;

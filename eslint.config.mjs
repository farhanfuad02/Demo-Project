/**
 * @file ESLint configuration for the workspace.
 *
 * @module eslint.config
 */

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import jsdoc from 'eslint-plugin-jsdoc';
import jest from 'eslint-plugin-jest';

/**
 * Three layers of rules: the JavaScript and documentation standards that apply
 * everywhere, the Next.js rules that apply only to the web client, and the Jest rules
 * that apply only to tests.
 *
 * The documentation rules are enforced rather than encouraged. The coding standard makes
 * JSDoc mandatory, and a standard nothing checks is a standard that decays into a
 * handful of well-documented files and a majority of undocumented ones.
 */
const eslintConfig = defineConfig([
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    'apps/api/data/**',
  ]),

  {
    name: 'hungry-ju/javascript',
    files: ['**/*.js', '**/*.mjs', '**/*.jsx'],
    plugins: { jsdoc },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      // Section 2 of the coding standard.
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['error'] }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-implicit-coercion': 'warn',
      'prefer-template': 'warn',
      'object-shorthand': 'warn',

      // Section 7: documentation.
      'jsdoc/require-jsdoc': [
        'error',
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ClassExpression: true,
          },
          contexts: ['TSPropertySignature'],
        },
      ],
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'error',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': ['error', { definedTags: ['file', 'module', 'augments'] }],
      'jsdoc/check-types': 'error',
      // Enabled mainly for its side effect: it marks a type referenced only from a
      // JSDoc tag as used, so an import that exists solely to document a thrown error
      // is not reported as dead code.
      'jsdoc/no-undefined-types': [
        'error',
        // Ambient runtime types that no module exports.
        { definedTypes: ['Console', 'RequestInit', 'Response', 'Request', 'setInterval'] },
      ],
      'jsdoc/require-file-overview': ['error', { tags: { file: { mustExist: true } } }],
    },
  },

  ...nextVitals.map((config) => ({
    ...config,
    files: ['apps/web/**/*.js', 'apps/web/**/*.jsx'],
  })),

  {
    name: 'hungry-ju/web-overrides',
    files: ['apps/web/**/*.js', 'apps/web/**/*.jsx'],
    rules: {
      // An App Router project has no `pages/` directory for this rule to check, and it
      // warns on every run when it cannot find one.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  {
    name: 'hungry-ju/tests',
    files: ['**/tests/**/*.js'],
    plugins: { jest },
    languageOptions: {
      globals: jest.environments.globals.globals,
    },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/expect-expect': 'error',
      'jest/valid-expect': 'error',
      // A test file documents itself through its describe blocks.
      'jsdoc/require-jsdoc': 'off',
      'no-console': 'off',
    },
  },

  {
    name: 'hungry-ju/scripts',
    files: ['apps/api/src/server.js', 'apps/api/src/config/database/seed.js'],
    rules: {
      // These are the entry points, where a failure has nowhere else to go.
      'no-console': 'off',
    },
  },
]);

export default eslintConfig;

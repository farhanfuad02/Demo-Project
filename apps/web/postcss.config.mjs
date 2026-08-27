/**
 * @file PostCSS configuration: Tailwind is the only plugin in the pipeline.
 *
 * @module postcss.config
 */

/** @type {{ plugins: Record<string, object> }} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;

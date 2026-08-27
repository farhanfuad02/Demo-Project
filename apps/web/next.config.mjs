/**
 * @file Next.js configuration.
 *
 * @module next.config
 */

/** Origin of the Express API, overridable for a deployed environment. */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * Application configuration.
 *
 * `/api/*` is rewritten to the Express service rather than called cross-origin from the
 * browser. Two things fall out of that: the refresh cookie stays same-site, so no CORS
 * credential dance is needed, and the API origin is a deployment detail the client
 * bundle never learns.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Proxies API traffic to the Express service.
   *
   * @returns {Promise<import('next').Rewrite[]>} Rewrite rules.
   */
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

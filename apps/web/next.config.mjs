/**
 * @file Next.js configuration.
 *
 * @module next.config
 */

/** Origin of the Express API, overridable for a deployed environment. */
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

/**
 * Whether this build targets a static host with no Node.js runtime — GitHub Pages.
 *
 * Set `NEXT_OUTPUT=export` to opt in. The export drops every server-backed feature the
 * app normally leans on, so it is a deliberate, separate build rather than the default.
 */
const isStaticExport = process.env.NEXT_OUTPUT === 'export';

/**
 * Sub-path the site is served from. GitHub Pages publishes a project site under
 * `/<repo>`, so assets and links have to be prefixed; a user or custom-domain site is
 * served from the root and needs no prefix.
 */
const basePath = process.env.NEXT_BASE_PATH ?? '';

/**
 * Application configuration.
 *
 * `/api/*` is rewritten to the Express service rather than called cross-origin from the
 * browser. Two things fall out of that: the refresh cookie stays same-site, so no CORS
 * credential dance is needed, and the API origin is a deployment detail the client
 * bundle never learns.
 *
 * A static export cannot rewrite — there is no server to do it — so that build omits the
 * rule and expects `NEXT_PUBLIC_API_BASE_URL` to carry an absolute API origin instead.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,

  ...(isStaticExport
    ? {
        output: 'export',
        // Emits `/login/index.html` rather than `/login.html`, which is what a plain
        // static file server resolves `/login/` to without rewrite rules.
        trailingSlash: true,
        ...(basePath ? { basePath } : {}),
        // The default loader needs the image optimisation server.
        images: { unoptimized: true },
      }
    : {
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
      }),
};

export default nextConfig;

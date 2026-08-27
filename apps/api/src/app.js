/**
 * @file Assembles the Express application.
 *
 * @module app
 */

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { HTTP_STATUS } from '@hungry-ju/shared/constants';
import { Container, TOKENS } from './config/container.js';
import { ErrorMiddleware } from './middleware/error-middleware.js';

/**
 * The HTTP application.
 *
 * Assembly is a class rather than a module of top-level statements so tests can build an
 * application over a throwaway database and never open a socket: `new Application(...)`
 * gives an Express handler, and `listen()` is a separate, optional step.
 *
 * The middleware order below is the contract — logging first so every request is
 * recorded whatever happens next, security headers before any handler, body parsing
 * before the routers that read bodies, and the error handler last because Express only
 * reaches it after everything else has declined.
 */
export class Application {
  /** @type {import('express').Express} */
  #express;

  /** @type {Container} */
  #container;

  /** @type {import('./config/database/database.js').Database} */
  #db;

  /** @type {import('./config/env.js').Env} */
  #env;

  /** @type {import('node:http').Server | null} */
  #server = null;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('./config/database/database.js').Database} dependencies.db - Connected
   *   database.
   * @param {import('./config/env.js').Env} dependencies.env - Process configuration.
   */
  constructor({ db, env }) {
    this.#db = db;
    this.#env = env;
    this.#container = Container.bootstrap({ db, env });
    this.#express = express();
    this.#configure();
  }

  /**
   * The Express handler, for `supertest` or a custom server.
   *
   * @returns {import('express').Express} The application.
   */
  get instance() {
    return this.#express;
  }

  /**
   * The dependency container, so tests can reach a service directly.
   *
   * @returns {Container} The container.
   */
  get container() {
    return this.#container;
  }

  /**
   * Installs middleware, routers, and the error handler.
   *
   * @returns {void}
   */
  #configure() {
    const app = this.#express;

    // Rate limiting keys on the caller's address, which behind a proxy is the proxy
    // unless Express is told to read the forwarded header.
    app.set('trust proxy', 1);
    app.disable('x-powered-by');

    app.use(this.#container.resolve(TOKENS.REQUEST_LOG_MIDDLEWARE).handler());
    app.use(
      helmet({
        // The API serves JSON to a separate origin; a content policy belongs on the
        // page that renders it, not on this response.
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
      })
    );
    app.use(
      cors({
        origin: this.#env.corsOrigins,
        credentials: true,
      })
    );
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Mounted twice on purpose: a platform probe hits the API directly at `/health`,
    // while a probe aimed at the deployed site reaches it through the client's `/api`
    // rewrite. One handler, so the two can never disagree about what healthy means.
    const health = this.#health();
    app.get('/health', health);
    app.get('/api/health', health);

    this.#mountRouters(app);

    app.use(ErrorMiddleware.notFound());
    app.use(this.#container.resolve(TOKENS.ERROR_MIDDLEWARE).handler());
  }

  /**
   * Mounts every resource router under `/api`.
   *
   * @param {import('express').Express} app - Application to mount on.
   * @returns {void}
   */
  #mountRouters(app) {
    /** @type {Array<[string, symbol]>} */
    const mounts = [
      ['/api/auth', TOKENS.AUTH_ROUTER],
      ['/api/users', TOKENS.USER_ROUTER],
      ['/api/shops', TOKENS.SHOP_ROUTER],
      ['/api/search', TOKENS.SEARCH_ROUTER],
      ['/api/cart', TOKENS.CART_ROUTER],
      ['/api/orders', TOKENS.ORDER_ROUTER],
      ['/api/deliveries', TOKENS.DELIVERY_ROUTER],
      ['/api/notifications', TOKENS.NOTIFICATION_ROUTER],
      ['/api/admin', TOKENS.ADMIN_ROUTER],
    ];

    for (const [path, token] of mounts) {
      app.use(path, this.#container.resolve(token).router);
    }
  }

  /**
   * The readiness probe (NFR-05).
   *
   * @returns {import('express').RequestHandler} Handler for `GET /health`.
   */
  #health() {
    /**
     * @param {import('express').Request} _request - Incoming request.
     * @param {import('express').Response} response - Outgoing response.
     * @returns {Promise<void>} Resolves once the probe has answered.
     */
    return async (_request, response) => {
      const database = await this.#db.healthCheck();
      response.status(database ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_ERROR).json({
        status: database ? 'ok' : 'degraded',
        database,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    };
  }

  /**
   * Starts the HTTP server and the background scheduler.
   *
   * @param {number} [port] - Port to listen on.
   * @returns {Promise<import('node:http').Server>} The listening server.
   */
  async listen(port = this.#env.port) {
    this.#container.resolve(TOKENS.SCHEDULER_SERVICE).start();
    return new Promise((resolve) => {
      this.#server = this.#express.listen(port, () => {
        this.#container.resolve(TOKENS.LOGGER).info('API listening', {
          port,
          environment: this.#env.nodeEnv,
        });
        resolve(this.#server);
      });
    });
  }

  /**
   * Stops the scheduler, closes the server, and flushes the database.
   *
   * @returns {Promise<void>} Resolves once everything is closed.
   */
  async close() {
    this.#container.resolve(TOKENS.SCHEDULER_SERVICE).stop();
    if (this.#server) {
      await new Promise((resolve) => this.#server.close(resolve));
      this.#server = null;
    }
    await this.#db.disconnect();
  }
}

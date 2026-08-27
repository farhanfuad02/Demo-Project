/**
 * @file Client controller for the session: sign-in, sign-out, profile.
 *
 * @module controllers/session-controller
 */

import { BaseController } from './base-controller.js';
import { SessionModel } from '../models/session-model.js';

/**
 * Owns who is signed in.
 *
 * The access token lives in this controller's memory and nowhere else — not in
 * `localStorage`, which any injected script can read. On a page reload the session is
 * rebuilt from the httpOnly refresh cookie instead, which costs one request and closes
 * the most commonly exploited hole in a browser client (SRS section 9).
 *
 * @augments BaseController
 */
export class SessionController extends BaseController {
  /** @type {Promise<SessionModel | null> | null} */
  #bootstrapInFlight = null;

  /**
   * @param {import('../services/api-client.js').ApiClient} api - API gateways.
   */
  constructor(api) {
    super(api, { user: null, ready: false });
    api.http.onSessionLost(() => this.setState({ user: null }));
  }

  /**
   * The signed-in user.
   *
   * @returns {SessionModel | null} Session, or `null` when signed out.
   */
  get user() {
    return /** @type {SessionModel | null} */ (this.state.user);
  }

  /**
   * Restores the session on the first page load.
   *
   * Concurrent callers share one attempt. Refresh tokens rotate, so a second overlapping
   * call would present a token the first one had already spent, get a 401, and conclude
   * the visitor is signed out — publishing `ready` with no user and bouncing every
   * guarded page to sign-in while the other call was busy succeeding. Two callers is not
   * hypothetical: React's strict mode double-invokes the mounting effect, and two tabs
   * opening together do the same thing in production.
   *
   * A failure here is not an error to show anyone: "not signed in" is the normal state
   * for a first-time visitor, and a red banner on the home page would say otherwise.
   *
   * @returns {Promise<SessionModel | null>} The restored session, or `null`.
   */
  async bootstrap() {
    if (this.state.ready) {
      return this.user;
    }
    if (!this.#bootstrapInFlight) {
      this.#bootstrapInFlight = (async () => {
        try {
          const session = await this.api.auth.refresh();
          this.api.http.setAccessToken(session.accessToken);
          const profile = await this.api.auth.me();
          this.setState({ user: new SessionModel(profile), ready: true });
        } catch {
          this.setState({ user: null, ready: true });
        } finally {
          this.#bootstrapInFlight = null;
        }
        return this.user;
      })();
    }
    return this.#bootstrapInFlight;
  }

  /**
   * Signs in (FR-A4).
   *
   * @param {string} identifier - E-mail address or phone number.
   * @param {string} password - Password.
   * @returns {Promise<SessionModel | null>} The session, or `null` when sign-in failed.
   */
  async login(identifier, password) {
    return this.run(async () => {
      const session = await this.api.auth.login(identifier, password);
      this.api.http.setAccessToken(session.accessToken);
      const profile = await this.api.auth.me();
      const user = new SessionModel(profile);
      this.setState({ user, ready: true });
      return user;
    });
  }

  /**
   * Registers an account (FR-A1).
   *
   * @param {Record<string, unknown>} payload - Registration fields.
   * @returns {Promise<Record<string, unknown> | null>} The pending account and its
   *   verification link, or `null` when registration failed.
   */
  async register(payload) {
    return this.run(() => this.api.auth.register(payload));
  }

  /**
   * Activates an account (FR-A2).
   *
   * @param {string} token - Token from the verification link.
   * @returns {Promise<Record<string, unknown> | null>} The verified account.
   */
  async verify(token) {
    return this.run(() => this.api.auth.verify(token));
  }

  /**
   * Starts a password reset (FR-A5).
   *
   * @param {string} identifier - E-mail address or phone number.
   * @returns {Promise<Record<string, unknown> | null>} Confirmation and, outside
   *   production, the reset link.
   */
  async forgotPassword(identifier) {
    return this.run(() => this.api.auth.forgotPassword(identifier));
  }

  /**
   * Completes a password reset (FR-A5).
   *
   * @param {string} token - Token from the reset link.
   * @param {string} password - New password.
   * @returns {Promise<Record<string, unknown> | null>} Confirmation.
   */
  async resetPassword(token, password) {
    return this.run(() => this.api.auth.resetPassword(token, password));
  }

  /**
   * Signs out (FR-A9).
   *
   * The local session is cleared even if the request fails: a user who taps Sign Out on
   * a shared machine must not be left signed in because the network dropped.
   *
   * @returns {Promise<void>} Resolves once signed out.
   */
  async logout() {
    try {
      await this.api.auth.logout();
    } catch {
      // Swallowed on purpose. The server-side revocation is best effort; letting the
      // rejection escape would abort the caller's redirect and leave the user looking
      // at a signed-out app that still shows the previous page.
    } finally {
      this.api.http.setAccessToken(null);
      this.setState({ user: null });
    }
  }

  /**
   * Re-reads the signed-in profile, after a change made elsewhere.
   *
   * @returns {Promise<SessionModel | null>} The refreshed session.
   */
  async refreshProfile() {
    if (!this.user) {
      return null;
    }
    const profile = await this.api.auth.me();
    const user = new SessionModel(profile);
    this.setState({ user });
    return user;
  }

  /**
   * Updates editable profile fields (FR-A8).
   *
   * @param {Record<string, unknown>} changes - Fields to update.
   * @returns {Promise<SessionModel | null>} The updated session.
   */
  async updateProfile(changes) {
    return this.run(async () => {
      const profile = await this.api.users.updateProfile(changes);
      const user = new SessionModel(profile);
      this.setState({ user });
      return user;
    });
  }

  /**
   * Updates the delivery address (FR-A8).
   *
   * @param {Record<string, unknown>} location - Hall and room.
   * @returns {Promise<SessionModel | null>} The updated session.
   */
  async updateLocation(location) {
    return this.run(async () => {
      await this.api.users.updateLocation(location);
      return this.refreshProfile();
    });
  }

  /**
   * Turns Deliver Mode on or off (FR-D1).
   *
   * @param {boolean} enabled - Desired state.
   * @returns {Promise<SessionModel | null>} The updated session.
   */
  async setDeliverMode(enabled) {
    return this.run(async () => {
      await this.api.users.setDeliverMode(enabled);
      return this.refreshProfile();
    });
  }
}

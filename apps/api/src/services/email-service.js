/**
 * @file Outbound e-mail: the abstract sender and the console implementation.
 *
 * @module services/email-service
 */

import { BaseService } from '../core/base-service.js';

/**
 * Abstract outbound mail sender.
 *
 * The message templates live here, in the base class, while delivery is left to
 * subclasses. That split is what lets the MVP run with no mail provider at all and
 * Phase 2 add an SMTP subclass without rewriting a single verification e-mail.
 *
 * @abstract
 * @augments BaseService
 */
export class EmailService extends BaseService {
  /** @type {string} */
  #webAppUrl;

  /**
   * @param {object} dependencies - Injected configuration.
   * @param {string} dependencies.webAppUrl - Base URL used to build links.
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor({ webAppUrl }) {
    super();
    if (new.target === EmailService) {
      throw new TypeError('EmailService is abstract');
    }
    this.#webAppUrl = webAppUrl;
  }

  /**
   * Base URL used to build links.
   *
   * @returns {string} Web application origin.
   */
  get webAppUrl() {
    return this.#webAppUrl;
  }

  /**
   * Delivers one prepared message.
   *
   * @abstract
   * @param {import('@hungry-ju/shared/types').EmailMessage} _message - Message to deliver.
   * @returns {Promise<void>} Resolves once handed off.
   * @throws {Error} Until a subclass implements it.
   */
  async send(_message) {
    throw new Error(`${this.constructor.name} must implement send()`);
  }

  /**
   * Sends the account verification link (FR-A2).
   *
   * @param {import('../models/user.js').User} user - Account to verify.
   * @param {string} token - Raw verification token.
   * @returns {Promise<string>} The link, so the caller can surface it in development.
   */
  async sendVerification(user, token) {
    const link = `${this.#webAppUrl}/verify?token=${encodeURIComponent(token)}`;
    await this.send({
      to: user.email,
      subject: 'Verify your Hungry_JU account',
      html: `<p>Hi ${user.fullName},</p>
<p>Confirm your account to start ordering from Bot Tola:</p>
<p><a href="${link}">Verify my account</a></p>`,
      text: `Hi ${user.fullName}, verify your Hungry_JU account: ${link}`,
    });
    return link;
  }

  /**
   * Sends the password reset link (FR-A5).
   *
   * @param {import('../models/user.js').User} user - Account resetting its password.
   * @param {string} token - Raw reset token.
   * @returns {Promise<string>} The link, so the caller can surface it in development.
   */
  async sendPasswordReset(user, token) {
    const link = `${this.#webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send({
      to: user.email,
      subject: 'Reset your Hungry_JU password',
      html: `<p>Hi ${user.fullName},</p>
<p>Use the link below to choose a new password. It expires in 15 minutes and works once.</p>
<p><a href="${link}">Reset my password</a></p>
<p>If you did not ask for this, you can ignore this e-mail.</p>`,
      text: `Reset your Hungry_JU password: ${link}`,
    });
    return link;
  }
}

/**
 * Writes messages to the log instead of sending them.
 *
 * The project has no mail budget (SRS section 2.4) and a demo that cannot complete
 * registration is worse than one whose verification link appears in the terminal. In
 * production the link is not logged, so this class is a development tool only.
 *
 * @augments EmailService
 */
export class ConsoleEmailService extends EmailService {
  /** @type {import('../lib/logger.js').Logger} */
  #logger;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {string} dependencies.webAppUrl - Base URL used to build links.
   * @param {import('../lib/logger.js').Logger} dependencies.logger - Where messages go.
   */
  constructor({ webAppUrl, logger }) {
    super({ webAppUrl });
    this.#logger = logger;
  }

  /**
   * Logs the message.
   *
   * @param {import('@hungry-ju/shared/types').EmailMessage} message - Message to deliver.
   * @returns {Promise<void>} Resolves immediately.
   */
  async send(message) {
    this.#logger.info('E-mail (console transport)', {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

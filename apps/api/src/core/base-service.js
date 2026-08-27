/**
 * @file Abstract business-logic unit shared by every service.
 *
 * @module core/base-service
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { ForbiddenError } from './errors/app-error.js';

/**
 * Abstract business-logic unit.
 *
 * Dependencies arrive through the constructor (composition over inheritance) so a
 * service can be unit-tested with fakes and never reaches for a global. The ownership
 * guards live here because IDOR prevention has to be uniform: a rule enforced in eight
 * services eight different ways is a rule enforced nowhere (SRS section 9).
 *
 * @abstract
 */
export class BaseService {
  /**
   * @throws {TypeError} When constructed directly instead of through a subclass.
   */
  constructor() {
    if (new.target === BaseService) {
      throw new TypeError('BaseService is abstract');
    }
  }

  /**
   * Object-level guard: does this actor own this resource, or hold admin override?
   *
   * @protected
   * @param {import('@hungry-ju/shared/types').Actor} actor - Authenticated principal.
   * @param {string | null | undefined} ownerId - User id the resource belongs to.
   * @param {string} [message] - Message used when the check fails.
   * @returns {void} Returns nothing when the actor is allowed.
   * @throws {ForbiddenError} When the actor neither owns the resource nor is an admin.
   */
  assertOwnership(actor, ownerId, message = 'This resource belongs to another user.') {
    if (actor.role === USER_ROLE.ADMIN) {
      return;
    }
    if (!ownerId || actor.id !== ownerId) {
      throw new ForbiddenError(message);
    }
  }

  /**
   * Role guard for rules that a middleware cannot express, such as "the vendor who owns
   * this shop" as opposed to "any vendor".
   *
   * @protected
   * @param {import('@hungry-ju/shared/types').Actor} actor - Authenticated principal.
   * @param {...string} roles - Roles allowed to proceed.
   * @returns {void} Returns nothing when the actor holds one of the roles.
   * @throws {ForbiddenError} When the actor holds none of them.
   */
  assertRole(actor, ...roles) {
    if (!roles.includes(actor.role)) {
      throw new ForbiddenError('Your role cannot perform this action.');
    }
  }
}

/**
 * @file Profile, delivery address, and Deliver Mode.
 *
 * @module services/user-service
 */

import { AUDIT_ACTION, AUDIT_ENTITY, USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseService } from '../core/base-service.js';
import { ConflictError, ForbiddenError } from '../core/errors/app-error.js';

/**
 * Everything a signed-in user changes about themselves (FR-A8, FR-D1).
 *
 * @augments BaseService
 */
export class UserService extends BaseService {
  /** @type {import('../repositories/user-repository.js').UserRepository} */
  #userRepository;

  /** @type {import('../repositories/student-profile-repository.js').StudentProfileRepository} */
  #studentProfileRepository;

  /** @type {import('../repositories/delivery-repository.js').DeliveryRepository} */
  #deliveryRepository;

  /** @type {import('./audit-service.js').AuditService} */
  #auditService;

  /**
   * @param {object} dependencies - Injected collaborators.
   * @param {import('../repositories/user-repository.js').UserRepository} dependencies.userRepository -
   *   Account storage.
   * @param {import('../repositories/student-profile-repository.js').StudentProfileRepository} dependencies.studentProfileRepository -
   *   Student profile storage.
   * @param {import('../repositories/delivery-repository.js').DeliveryRepository} dependencies.deliveryRepository -
   *   Used to block a mode switch mid-delivery.
   * @param {import('./audit-service.js').AuditService} dependencies.auditService - Audit trail.
   */
  constructor({ userRepository, studentProfileRepository, deliveryRepository, auditService }) {
    super();
    this.#userRepository = userRepository;
    this.#studentProfileRepository = studentProfileRepository;
    this.#deliveryRepository = deliveryRepository;
    this.#auditService = auditService;
  }

  /**
   * Loads the signed-in user together with their student profile, which is what the
   * client needs to render a header and pre-fill a delivery address in one call.
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @returns {Promise<Record<string, unknown>>} Account, and profile when a student.
   */
  async profileOf(actor) {
    const user = await this.#userRepository.findByIdOrFail(actor.id, 'Account');
    /** @type {Record<string, unknown>} */
    const result = { ...user.toJSON() };
    if (user.role === USER_ROLE.STUDENT) {
      const profile = await this.#studentProfileRepository.findOrCreateByUserId(user.id);
      result.profile = profile.toJSON();
    }
    return result;
  }

  /**
   * Updates editable profile fields (FR-A8).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in user.
   * @param {object} changes - Fields to update.
   * @param {string} [changes.fullName] - Display name.
   * @param {string} [changes.phone] - Contact phone.
   * @param {string | null} [changes.gender] - Self-declared gender.
   * @param {string | null} [changes.photoUrl] - Avatar URL.
   * @returns {Promise<Record<string, unknown>>} The updated profile.
   * @throws {ConflictError} When the new phone number belongs to another account (BR-01).
   */
  async updateProfile(actor, changes) {
    const user = await this.#userRepository.findByIdOrFail(actor.id, 'Account');

    if (changes.phone && changes.phone !== user.phone) {
      const owner = await this.#userRepository.findByPhone(changes.phone);
      if (owner && owner.id !== user.id) {
        throw new ConflictError('That phone number belongs to another account.');
      }
    }

    user.updateProfile(changes);
    await this.#userRepository.save(user);
    await this.#auditService.record({
      actorUserId: actor.id,
      entityType: AUDIT_ENTITY.USER,
      entityId: user.id,
      action: AUDIT_ACTION.UPDATE,
      newValue: changes,
    });
    return this.profileOf(actor);
  }

  /**
   * Updates a student's delivery address (FR-A8, FR-C6).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {object} location - Address fields.
   * @param {string} [location.hallName] - Residence hall.
   * @param {string} [location.roomNo] - Room or gate.
   * @returns {Promise<Record<string, unknown>>} The updated student profile.
   * @throws {ForbiddenError} When the caller is not a student.
   */
  async updateLocation(actor, location) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    const profile = await this.#studentProfileRepository.findOrCreateByUserId(actor.id);
    profile.updateLocation(location);
    const saved = await this.#studentProfileRepository.save(profile);
    return saved.toJSON();
  }

  /**
   * Turns Deliver Mode on or off (FR-D1).
   *
   * Switching off is refused while a delivery is in progress: the food is already
   * somebody's responsibility, and a toggle is not the way to hand it back. Releasing
   * the order is (FR-D8).
   *
   * @param {import('@hungry-ju/shared/types').Actor} actor - Signed-in student.
   * @param {boolean} enabled - Desired state.
   * @returns {Promise<Record<string, unknown>>} The updated student profile.
   * @throws {ForbiddenError} When the caller is not a student.
   * @throws {ConflictError} When a delivery is still active.
   */
  async setDeliverMode(actor, enabled) {
    this.assertRole(actor, USER_ROLE.STUDENT);
    if (!enabled) {
      const active = await this.#deliveryRepository.findActiveByRider(actor.id);
      if (active) {
        throw new ConflictError('Finish or release your active delivery before going offline.');
      }
    }
    const profile = await this.#studentProfileRepository.findOrCreateByUserId(actor.id);
    profile.setDeliveryEnabled(enabled);
    const saved = await this.#studentProfileRepository.save(profile);
    return saved.toJSON();
  }
}

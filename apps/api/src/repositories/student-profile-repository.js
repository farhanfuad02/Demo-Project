/**
 * @file Data access for student profiles.
 *
 * @module repositories/student-profile-repository
 */

import { BaseRepository } from '../core/base-repository.js';
import { StudentProfile } from '../models/student-profile.js';

/**
 * Reads and writes the `student_profiles` table.
 *
 * @augments BaseRepository<StudentProfile>
 */
export class StudentProfileRepository extends BaseRepository {
  /**
   * @param {import('../config/database/database.js').Database} db - Database client.
   */
  constructor(db) {
    super(db, 'student_profiles');
  }

  /**
   * Finds the profile belonging to an account.
   *
   * @param {string} userId - Owning account.
   * @returns {Promise<StudentProfile | null>} Profile, or `null`.
   */
  async findByUserId(userId) {
    return this.findOne({ user_id: userId });
  }

  /**
   * Finds the profile belonging to an account, creating an empty one if it is missing.
   *
   * A student who registered before ever setting a hall still needs somewhere to store
   * the Deliver Mode flag, and every caller wanting the same lazy creation would be five
   * copies of the same three lines.
   *
   * @param {string} userId - Owning account.
   * @returns {Promise<StudentProfile>} The profile.
   */
  async findOrCreateByUserId(userId) {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }
    return this.create(new StudentProfile({ userId }));
  }

  /**
   * Maps a stored row onto a profile.
   *
   * @param {import('@hungry-ju/shared/types').PersistenceRow} row - Row from storage.
   * @returns {StudentProfile} Hydrated profile.
   */
  toModel(row) {
    return StudentProfile.fromPersistence(row);
  }
}

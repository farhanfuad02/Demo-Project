/**
 * @file Unit tests for Identifier.
 *
 * @module tests/unit/utils/identifier
 */

import { describe, expect, it } from '@jest/globals';
import { Identifier } from '../../../src/utils/identifier.js';

describe('Identifier', () => {
  it('generates distinct UUIDs', () => {
    const ids = new Set(Array.from({ length: 200 }, () => Identifier.uuid()));
    expect(ids.size).toBe(200);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/);
  });

  it('generates URL-safe tokens', () => {
    const token = Identifier.token();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(30);
  });

  it('generates a zero-padded PIN of the requested length', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(Identifier.pin(4)).toMatch(/^\d{4}$/);
    }
    expect(Identifier.pin(6)).toMatch(/^\d{6}$/);
  });

  it('generates order references without ambiguous characters', () => {
    // These get read aloud down a hall corridor, so 0/O and 1/I must not appear.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(Identifier.orderReference()).toMatch(/^HJU-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });
});

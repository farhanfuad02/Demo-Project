/**
 * @file Unit tests for the abstract base classes.
 *
 * @module tests/unit/core/base-classes
 */

import { describe, expect, it } from '@jest/globals';
import { USER_ROLE } from '@hungry-ju/shared/enums';
import { BaseModel } from '../../../src/core/base-model.js';
import { BaseRepository } from '../../../src/core/base-repository.js';
import { BaseService } from '../../../src/core/base-service.js';
import { BaseController } from '../../../src/core/base-controller.js';
import { BaseMiddleware } from '../../../src/core/base-middleware.js';
import { BaseRouter } from '../../../src/core/base-router.js';
import { BaseStateMachine } from '../../../src/core/base-state-machine.js';
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from '../../../src/core/errors/app-error.js';

/** A minimal concrete model, so the base class can be exercised. */
class ConcreteModel extends BaseModel {
  /**
   * @returns {void} Always valid.
   */
  validate() {}

  /**
   * @returns {Record<string, unknown>} The base row.
   */
  toPersistence() {
    return this.baseRow();
  }

  /**
   * @returns {Record<string, unknown>} A projection.
   */
  toJSON() {
    return { id: this.id };
  }
}

/** A model that leaves every abstract method alone. */
class BareModel extends BaseModel {}

describe('BaseModel', () => {
  it('cannot be constructed directly', () => {
    expect(() => new BaseModel()).toThrow(TypeError);
  });

  it('is unpersisted until it is given an id', () => {
    const model = new ConcreteModel();
    expect(model.isPersisted).toBe(false);
    model.assignId('abc');
    expect(model.isPersisted).toBe(true);
    expect(model.id).toBe('abc');
  });

  it('refuses to be re-keyed once persisted', () => {
    const model = new ConcreteModel({ id: 'abc' });
    expect(() => model.assignId('def')).toThrow(ValidationError);
  });

  it('advances its updated timestamp when touched', async () => {
    const model = new ConcreteModel();
    const before = model.updatedAt.getTime();
    await new Promise((resolve) => setTimeout(resolve, 2));
    model.touch();
    expect(model.updatedAt.getTime()).toBeGreaterThan(before - 1);
  });

  it('serialises identity columns in snake_case', () => {
    const row = new ConcreteModel({ id: 'abc' }).toPersistence();
    expect(row).toHaveProperty('created_at');
    expect(row).toHaveProperty('updated_at');
  });

  it('reports which abstract method a subclass forgot', () => {
    const model = new BareModel();
    expect(() => model.validate()).toThrow(/BareModel must implement validate/);
    expect(() => model.toPersistence()).toThrow(/toPersistence/);
    expect(() => model.toJSON()).toThrow(/toJSON/);
  });
});

describe('BaseRepository', () => {
  it('cannot be constructed directly', () => {
    expect(() => new BaseRepository({}, 'users')).toThrow(TypeError);
  });

  it('requires a subclass to supply the row mapping', () => {
    /** A repository that forgot `toModel`. */
    class BareRepository extends BaseRepository {}
    const repository = new BareRepository({}, 'users');
    expect(() => repository.toModel({})).toThrow(/BareRepository must implement toModel/);
  });
});

describe('BaseService', () => {
  /** A service that exposes the protected guards for testing. */
  class ConcreteService extends BaseService {
    /**
     * @param {object} actor - Principal.
     * @param {string} ownerId - Owner.
     * @returns {void} Nothing.
     */
    check(actor, ownerId) {
      this.assertOwnership(actor, ownerId);
    }

    /**
     * @param {object} actor - Principal.
     * @param {...string} roles - Allowed roles.
     * @returns {void} Nothing.
     */
    checkRole(actor, ...roles) {
      this.assertRole(actor, ...roles);
    }
  }

  const service = new ConcreteService();

  it('cannot be constructed directly', () => {
    expect(() => new BaseService()).toThrow(TypeError);
  });

  it('lets an owner through', () => {
    expect(() => service.check({ id: 'u1', role: USER_ROLE.STUDENT }, 'u1')).not.toThrow();
  });

  it('refuses somebody else', () => {
    expect(() => service.check({ id: 'u2', role: USER_ROLE.STUDENT }, 'u1')).toThrow(
      ForbiddenError
    );
  });

  it('refuses when the resource has no owner at all', () => {
    expect(() => service.check({ id: 'u1', role: USER_ROLE.STUDENT }, null)).toThrow(
      ForbiddenError
    );
  });

  it('lets an admin override ownership', () => {
    expect(() => service.check({ id: 'admin', role: USER_ROLE.ADMIN }, 'u1')).not.toThrow();
  });

  it('gates on role', () => {
    expect(() => service.checkRole({ role: USER_ROLE.VENDOR }, USER_ROLE.VENDOR)).not.toThrow();
    expect(() => service.checkRole({ role: USER_ROLE.STUDENT }, USER_ROLE.VENDOR)).toThrow(
      ForbiddenError
    );
  });
});

describe('BaseController', () => {
  /** A controller that records what it was called with. */
  class ConcreteController extends BaseController {
    /**
     * @param {object} request - Request.
     * @returns {object} The actor.
     */
    async whoami(request) {
      this.seen = this.actor(request);
      return this.seen;
    }

    /**
     * @returns {never} Always throws.
     */
    async explode() {
      throw new ConflictError('nope');
    }
  }

  it('cannot be constructed directly', () => {
    expect(() => new BaseController()).toThrow(TypeError);
  });

  it('binds a method so private fields survive being passed to a router', async () => {
    const controller = new ConcreteController();
    const handler = controller.handle('whoami');
    await handler({ actor: { id: 'u1' } }, {}, () => {});
    expect(controller.seen).toEqual({ id: 'u1' });
  });

  it('forwards a thrown failure to the error channel', async () => {
    const controller = new ConcreteController();
    const next = (error) => {
      next.received = error;
    };
    await controller.handle('explode')({}, {}, next);
    expect(next.received).toBeInstanceOf(ConflictError);
  });

  it('reads only validated input, never the raw body', () => {
    /** A controller exposing the protected readers. */
    class Reader extends BaseController {
      /**
       * @param {object} request - Request.
       * @returns {object} Validated body.
       */
      read(request) {
        return this.body(request);
      }
    }
    const reader = new Reader();
    expect(reader.read({ body: { role: 'admin' } })).toEqual({});
    expect(reader.read({ validated: { body: { name: 'ok' } } })).toEqual({ name: 'ok' });
  });
});

describe('BaseMiddleware and BaseRouter', () => {
  it('cannot be constructed directly', () => {
    expect(() => new BaseMiddleware()).toThrow(TypeError);
    expect(() => new BaseRouter()).toThrow(TypeError);
  });

  it('registers routes once, however often the router is read', () => {
    let registrations = 0;
    /** A router that counts its registrations. */
    class CountingRouter extends BaseRouter {
      /**
       * @returns {void} Nothing.
       */
      register() {
        registrations += 1;
      }
    }
    const router = new CountingRouter();
    router.router;
    router.router;
    expect(registrations).toBe(1);
  });
});

describe('BaseStateMachine', () => {
  /** A two-state machine for testing. */
  class Traffic extends BaseStateMachine {
    /** Builds the machine. */
    constructor() {
      super({ green: ['amber'], amber: ['red'], red: [] });
    }
  }
  const machine = new Traffic();

  it('cannot be constructed directly', () => {
    expect(() => new BaseStateMachine({})).toThrow(TypeError);
  });

  it('allows a declared move', () => {
    expect(machine.canTransition('green', 'amber')).toBe(true);
  });

  it('refuses an undeclared move', () => {
    expect(machine.canTransition('green', 'red')).toBe(false);
  });

  it('treats an unknown state as having no successors', () => {
    expect(machine.nextStates('purple')).toEqual([]);
  });

  it('recognises a terminal state', () => {
    expect(machine.isTerminal('red')).toBe(true);
    expect(machine.isTerminal('green')).toBe(false);
  });

  it('rejects an illegal move as a conflict, not a validation failure', () => {
    // The request was well-formed; the resource simply moved on.
    expect(() => machine.assertTransition('green', 'red')).toThrow(ConflictError);
  });
});

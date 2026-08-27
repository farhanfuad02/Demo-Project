'use client';

/**
 * @file React context that publishes the controller registry to the view layer.
 *
 * @module views/providers/app-provider
 */

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ControllerRegistry } from '../../controllers/controller-registry.js';

/** @type {import('react').Context<ControllerRegistry | null>} */
const RegistryContext = createContext(null);

/**
 * Makes the controllers available to every view below it.
 *
 * The registry is built once and kept for the life of the tab. Rebuilding it on a
 * re-render would throw away the session, the cart, and every running poll — so it is
 * memoised, and its timers are stopped on unmount.
 *
 * @param {object} props - Component props.
 * @param {import('react').ReactNode} props.children - Application tree.
 * @returns {import('react').ReactNode} The provider.
 */
export function AppProvider({ children }) {
  const registry = useMemo(() => new ControllerRegistry(), []);

  useEffect(() => {
    // Restoring the session from the refresh cookie is the first thing the client does;
    // until it resolves, every guarded view shows its loading state rather than
    // bouncing a signed-in user to the sign-in page.
    void registry.session.bootstrap();
    return () => registry.dispose();
  }, [registry]);

  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

/**
 * The controller registry.
 *
 * @returns {ControllerRegistry} The registry.
 * @throws {Error} When used outside the provider.
 */
export function useRegistry() {
  const registry = useContext(RegistryContext);
  if (!registry) {
    throw new Error('useRegistry must be used inside <AppProvider>.');
  }
  return registry;
}

/**
 * Subscribes a component to one controller's state.
 *
 * `useSyncExternalStore` is the binding React provides for exactly this shape of store,
 * and using it rather than an effect plus `useState` means no torn reads during a
 * concurrent render.
 *
 * @template {import('../../controllers/base-controller.js').BaseController} T
 * @param {T} controller - Controller to observe.
 * @returns {Record<string, unknown>} The current state snapshot.
 */
export function useControllerState(controller) {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    // The server render has no live controller state, so it uses the same initial
    // snapshot the client starts from — which keeps hydration from mismatching.
    controller.getState
  );
}

/**
 * The signed-in session, and whether the session has finished restoring.
 *
 * @returns {{ user: import('../../models/session-model.js').SessionModel | null, ready: boolean }}
 *   Session state.
 */
export function useSession() {
  const registry = useRegistry();
  const state = useControllerState(registry.session);
  return {
    user: /** @type {import('../../models/session-model.js').SessionModel | null} */ (state.user),
    ready: Boolean(state.ready),
  };
}

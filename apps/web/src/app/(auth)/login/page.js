/**
 * @file Route for `/login` (FR-A4).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(auth)/login/page
 */

import { Suspense } from 'react';
import { LoginScreen } from '../../../views/screens/auth/login-screen.jsx';

/**
 * Renders the LoginScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

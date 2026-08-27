/**
 * @file Route for `/forgot-password` (FR-A5).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(auth)/forgot-password/page
 */

import { Suspense } from 'react';
import { ForgotPasswordScreen } from '../../../views/screens/auth/password-screens.jsx';

/**
 * Renders the ForgotPasswordScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordScreen />
    </Suspense>
  );
}

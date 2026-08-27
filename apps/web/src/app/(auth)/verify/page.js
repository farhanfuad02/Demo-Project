/**
 * @file Route for `/verify` (FR-A2).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(auth)/verify/page
 */

import { Suspense } from 'react';
import { VerifyScreen } from '../../../views/screens/auth/verify-screen.jsx';

/**
 * Renders the VerifyScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <VerifyScreen />
    </Suspense>
  );
}

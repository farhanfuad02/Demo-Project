/**
 * @file Route for `/register` (FR-A1).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(auth)/register/page
 */

import { RegisterScreen } from '../../../views/screens/auth/register-screen.jsx';

/**
 * Renders the RegisterScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return <RegisterScreen />;
}

/**
 * @file Route for `/profile` (FR-A8).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/profile/page
 */

import { RoleGuard } from '../../../views/layout/app-shell.jsx';
import { ProfileScreen } from '../../../views/screens/student/profile-screen.jsx';

/**
 * Renders the ProfileScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard>
      <ProfileScreen />
    </RoleGuard>
  );
}

/**
 * @file Route for `/admin/users` (FR-G2).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(admin)/admin/users/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { AdminUsersScreen } from '../../../../views/screens/admin/admin-users-screen.jsx';

/**
 * Renders the AdminUsersScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.ADMIN]}>
      <AdminUsersScreen />
    </RoleGuard>
  );
}

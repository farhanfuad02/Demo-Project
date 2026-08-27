/**
 * @file Route for `/admin/settings` (FR-G6).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(admin)/admin/settings/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { AdminSettingsScreen } from '../../../../views/screens/admin/admin-settings-screen.jsx';

/**
 * Renders the AdminSettingsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.ADMIN]}>
      <AdminSettingsScreen />
    </RoleGuard>
  );
}

/**
 * @file Route for `/admin/vendors` (FR-G1).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(admin)/admin/vendors/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { AdminVendorsScreen } from '../../../../views/screens/admin/admin-vendors-screen.jsx';

/**
 * Renders the AdminVendorsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.ADMIN]}>
      <AdminVendorsScreen />
    </RoleGuard>
  );
}

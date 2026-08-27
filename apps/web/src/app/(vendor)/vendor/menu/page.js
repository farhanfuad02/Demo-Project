/**
 * @file Route for `/vendor/menu` (FR-B2).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(vendor)/vendor/menu/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { VendorMenuScreen } from '../../../../views/screens/vendor/vendor-menu-screen.jsx';

/**
 * Renders the VendorMenuScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.VENDOR]}>
      <VendorMenuScreen />
    </RoleGuard>
  );
}

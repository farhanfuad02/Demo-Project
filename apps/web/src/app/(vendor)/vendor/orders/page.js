/**
 * @file Route for `/vendor/orders` (FR-B4, FR-B5).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(vendor)/vendor/orders/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { VendorOrdersScreen } from '../../../../views/screens/vendor/vendor-orders-screen.jsx';

/**
 * Renders the VendorOrdersScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.VENDOR]}>
      <VendorOrdersScreen />
    </RoleGuard>
  );
}

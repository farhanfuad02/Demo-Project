/**
 * @file Route for `/vendor/shop` (FR-B1, FR-B3).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(vendor)/vendor/shop/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { VendorShopScreen } from '../../../../views/screens/vendor/vendor-shop-screen.jsx';

/**
 * Renders the VendorShopScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.VENDOR]}>
      <VendorShopScreen />
    </RoleGuard>
  );
}

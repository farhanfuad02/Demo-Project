/**
 * @file Route for `/vendor/analytics` (FR-B6).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(vendor)/vendor/analytics/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { VendorAnalyticsScreen } from '../../../../views/screens/vendor/vendor-analytics-screen.jsx';

/**
 * Renders the VendorAnalyticsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.VENDOR]}>
      <VendorAnalyticsScreen />
    </RoleGuard>
  );
}

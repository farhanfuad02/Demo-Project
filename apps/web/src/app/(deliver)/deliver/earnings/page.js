/**
 * @file Route for `/deliver/earnings` (FR-D7).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(deliver)/deliver/earnings/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../../views/layout/app-shell.jsx';
import { EarningsScreen } from '../../../../views/screens/deliver/earnings-screen.jsx';

/**
 * Renders the EarningsScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.STUDENT]}>
      <EarningsScreen />
    </RoleGuard>
  );
}

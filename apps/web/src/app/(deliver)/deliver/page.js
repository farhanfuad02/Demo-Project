/**
 * @file Route for `/deliver` (Epic D).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(deliver)/deliver/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../views/layout/app-shell.jsx';
import { DeliverScreen } from '../../../views/screens/deliver/deliver-screen.jsx';

/**
 * Renders the DeliverScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.STUDENT]}>
      <DeliverScreen />
    </RoleGuard>
  );
}

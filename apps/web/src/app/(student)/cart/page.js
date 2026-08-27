/**
 * @file Route for `/cart` (FR-C5, UC-01).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/cart/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../views/layout/app-shell.jsx';
import { CartScreen } from '../../../views/screens/student/cart-screen.jsx';

/**
 * Renders the CartScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.STUDENT]}>
      <CartScreen />
    </RoleGuard>
  );
}

/**
 * @file Route for `/orders` (FR-C8).
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/(student)/orders/page
 */

import { USER_ROLE } from '@hungry-ju/shared/enums';
import { RoleGuard } from '../../../views/layout/app-shell.jsx';
import { OrdersScreen } from '../../../views/screens/student/orders-screen.jsx';

/**
 * Renders the OrdersScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return (
    <RoleGuard roles={[USER_ROLE.STUDENT]}>
      <OrdersScreen />
    </RoleGuard>
  );
}

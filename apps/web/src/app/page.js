/**
 * @file The public landing page.
 *
 * Routing only: the segment resolves its parameters and mounts the screen that owns
 * the behaviour. Nothing under `app/` holds state or talks to the API.
 *
 * @module app/page
 */

import { LandingScreen } from '../views/screens/landing-screen.jsx';

/**
 * Renders the LandingScreen.
 *
 * @returns {import('react').ReactNode} The page.
 */
export default function Page() {
  return <LandingScreen />;
}

/**
 * Central router wiring all module routes (docs/03 §6 API surface).
 */
import { Router } from './http';
import { registerAuthRoutes } from '../modules/auth/routes';
import { registerCasRoutes } from '../modules/cas/routes';
import { registerPlaceRoutes } from '../modules/place/routes';
import { registerEventRoutes } from '../modules/event/routes';
import { registerBookingRoutes } from '../modules/booking/routes';
import { registerIntegrationRoutes } from '../modules/integration/routes';

export function buildRouter(): Router {
  const router = new Router();
  registerAuthRoutes(router);
  registerCasRoutes(router);
  registerPlaceRoutes(router);
  registerEventRoutes(router);
  registerBookingRoutes(router);
  registerIntegrationRoutes(router);
  return router;
}

export const router = buildRouter();
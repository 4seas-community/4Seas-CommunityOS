/**
 * CAS client factory: picks HttpCasClient when CAS is configured (CAS_API_URL +
 * CAS_SERVICE_KEY), otherwise the in-memory MockCasClient for development.
 */
import { config, isCasHttpConfigured } from '../../lib/config';
import { HttpCasClient } from './http-client';
import { MockCasClient } from './mock-client';
import type { CasClient } from './types';

let singleton: CasClient | null = null;

export function createCasClient(): CasClient {
  return isCasHttpConfigured() ? new HttpCasClient() : new MockCasClient();
}

/** Process-wide CAS client (mock in dev, HTTP when configured). */
export function casClient(): CasClient {
  if (!singleton) singleton = createCasClient();
  return singleton;
}

export { config as casEnv };
export * from './types';

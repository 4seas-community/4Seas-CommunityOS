/**
 * Local role checks. Roles are stored per scope on members (docs/03 §2.4):
 *   [{ "scope": "venue:*", "role": "venue_manager" }, { "scope": "community:*", "role": "admin" }]
 */
import { forbidden } from '../errors';
import type { SessionPayload } from './session';

export interface Role {
  scope: string;
  role: string;
}

/**
 * Does the role set grant `role` for `scope` (e.g. "venue:<uuid>", "community:*")?
 *
 * Scoping rules (security-critical — see the cross-venue bypass this used to have):
 *  - omitted scope            → presence check only; callers that guard a specific
 *                               resource MUST pass its scope, or any holder of the
 *                               role anywhere would pass.
 *  - exact "venue:<id>"       → matches only that venue.
 *  - wildcard "venue:*"       → matches every venue scope (and only venue scopes).
 *  - "community:*"            → community-wide role, applies to every scope.
 */
export function hasRole(roles: Role[], role: string, scope?: string): boolean {
  for (const r of roles) {
    if (r.role !== role) continue;
    if (!scope) return true;
    if (r.scope === scope) return true;
    if (r.scope.endsWith(':*') && scope.startsWith(r.scope.slice(0, -1))) return true;
    const [kind] = r.scope.split(':');
    if (kind === 'community') return true;
  }
  return false;
}

export function isAdmin(session: SessionPayload): boolean {
  return hasRole(session.roles, 'admin');
}

/** Throws 403 unless the session holds `role` for `scope`. */
export function requireRole(session: SessionPayload, role: string, scope?: string): void {
  if (!hasRole(session.roles, role, scope)) {
    throw forbidden('Requires role ' + role + (scope ? ' on ' + scope : ''));
  }
}

export const ROLES = {
  admin: 'admin',
  venueManager: 'venue_manager',
  host: 'host',
  member: 'member',
} as const;

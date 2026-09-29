/**
 * Server-side session helper for pages: resolves the signed-in member (with
 * roles) without throwing when nobody is signed in, so layouts can decide what
 * to render (e.g. whether to show the Admin nav entry).
 */
import { apiGet } from './api-client';
import { hasRole } from './auth/roles';

export interface CurrentMember {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  roles: Array<{ scope: string; role: string }>;
  tier: string;
}

export async function getCurrentMember(): Promise<CurrentMember | null> {
  try {
    const res = await apiGet<{ member: CurrentMember | null }>('/api/me');
    return res.member ?? null;
  } catch {
    return null; // not signed in (or identity service unavailable)
  }
}

/** Admin console visibility: community admins and any venue manager. */
export function canUseAdmin(member: CurrentMember | null): boolean {
  if (!member) return false;
  return hasRole(member.roles, 'admin') || hasRole(member.roles, 'venue_manager');
}

export function isCommunityAdmin(member: CurrentMember | null): boolean {
  return Boolean(member && hasRole(member.roles, 'admin'));
}

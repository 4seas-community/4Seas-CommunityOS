/**
 * Shared factories for tests: community/building/venue/rule/member + sessions.
 */
import { db } from '../src/lib/db';
import { buildings, communities, floors, venues, venueRules } from '../src/modules/place/schema';
import { members } from '../src/modules/people/schema';
import type { SessionPayload } from '../src/lib/auth/session';
import type { BookingCreateInput } from '../src/modules/booking/service';

export async function seedCommunity() {
  const [community] = await db
    .insert(communities)
    .values({ name: 'Test Community', slug: 'test', timezone: 'Asia/Bangkok' })
    .returning();
  return community;
}

export async function seedVenue(
  communityId: string,
  overrides: Partial<{ pointsPerHour: number; approvalMode: 'auto' | 'venue_manager' | 'community_admin'; accessRequirement: 'verified_members' | 'roles' | 'public'; depositPoints: number }> = {},
) {
  const [building] = await db
    .insert(buildings)
    .values({ communityId, name: 'Building F', address: 'test', timezone: 'Asia/Bangkok' })
    .returning();
  const [venue] = await db
    .insert(venues)
    .values({
      buildingId: building.id,
      name: 'Event Space',
      code: 'F1-EVENT',
      capacitySeated: 50,
      capacityStanding: 80,
      amenities: ['projector'],
      openingHours: {
        '1': [['09:00', '21:00']],
        '2': [['09:00', '21:00']],
        '3': [['09:00', '21:00']],
        '4': [['09:00', '21:00']],
        '5': [['09:00', '21:00']],
        '6': [['10:00', '22:00']],
        '7': [['10:00', '22:00']],
      },
      defaultBufferMin: 30,
      status: 'open',
    })
    .returning();
  const [rule] = await db
    .insert(venueRules)
    .values({
      venueId: venue.id,
      version: 1,
      allowedEventTypes: ['workshop', 'talk', 'community'],
      approvalMode: overrides.approvalMode ?? 'auto',
      pointsPerHour: overrides.pointsPerHour ?? 0,
      accessRequirement: overrides.accessRequirement ?? 'verified_members',
      depositPoints: overrides.depositPoints ?? 0,
      prohibitedBehaviors: ['No smoking'],
    })
    .returning();
  return { building, venue, rule };
}

export async function seedMember(email = 'member@test.dev', opts: { verified?: boolean; roles?: SessionPayload['roles'] } = {}) {
  const [member] = await db
    .insert(members)
    .values({
      email,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      roles: opts.roles ?? [{ scope: 'community:*', role: 'member' }],
    })
    .returning();
  return member;
}

export function sessionFor(memberId: string, roles: SessionPayload['roles'] = [{ scope: 'community:*', role: 'member' }]): SessionPayload {
  return { sub: memberId, email: 'member@test.dev', roles };
}

export function bookingInput(venueId: string, startAt: Date, endAt: Date): BookingCreateInput {
  return {
    venueId,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    attendeesCount: 10,
    purpose: 'team meeting',
    acceptedProhibited: true,
    eventId: null,
  };
}

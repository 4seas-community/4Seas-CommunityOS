/**
 * Seed 4Seas sample data: buildings, floors, venues, rules and a couple of events.
 * Mirrors the real 4Seas layout in Chiang Mai (Building F, 4Seas Nimman).
 *
 *   pnpm seed
 */
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/lib/db';
import { buildings, communities, floors, venues, venueRules } from '../src/modules/place/schema';
import { members } from '../src/modules/people/schema';
import { events } from '../src/modules/event/schema';

async function main() {
  // ---- community ----
  const [community] = await db
    .insert(communities)
    .values({ name: '4Seas Community', slug: '4seas', timezone: 'Asia/Bangkok' })
    .onConflictDoNothing()
    .returning();
  const communityRow =
    community ?? (await db.select().from(communities).limit(1))[0];
  if (!communityRow) throw new Error('community seed failed');

  // ---- buildings ----
  const [buildingF] = await db
    .insert(buildings)
    .values({
      communityId: communityRow.id,
      name: 'Building F',
      address: '4Seas Campus, Nimmanhaeminda, Chiang Mai',
      timezone: 'Asia/Bangkok',
    })
    .onConflictDoNothing()
    .returning();
  const [nimman] = await db
    .insert(buildings)
    .values({
      communityId: communityRow.id,
      name: '4Seas Nimman',
      address: '4Seas Nimman, Chiang Mai',
      timezone: 'Asia/Bangkok',
    })
    .onConflictDoNothing()
    .returning();

  const buildingRows = await db.select().from(buildings);
  const f = buildingF ?? buildingRows.find((b) => b.name === 'Building F')!;
  const nm = nimman ?? buildingRows.find((b) => b.name === '4Seas Nimman')!;

  // ---- floors ----
  const floorRows = await db.select().from(floors);
  const f1 = floorRows.find((x) => x.buildingId === f.id && x.name === '1st Floor');
  const f3 = floorRows.find((x) => x.buildingId === f.id && x.name === '3rd Floor');
  if (!f1) await db.insert(floors).values({ buildingId: f.id, name: '1st Floor', sortOrder: 1 });
  if (!f3) await db.insert(floors).values({ buildingId: f.id, name: '3rd Floor', sortOrder: 3 });
  const floorsAfter = await db.select().from(floors);
  const floorF1 = floorsAfter.find((x) => x.buildingId === f.id && x.name === '1st Floor')!;

  // ---- venues ----
  const venueSeeds = [
    {
      name: 'Event Space',
      code: 'F1-EVENT',
      buildingId: f.id,
      floorId: floorF1.id,
      areaSqm: '120',
      capacitySeated: 80,
      capacityStanding: 120,
      amenities: ['projector', 'sound_system', 'stage', 'wifi', 'ac'],
      services: ['cleaning', 'security'],
      rules: {
        allowedEventTypes: ['workshop', 'talk', 'party', 'community'],
        approvalMode: 'auto' as const,
        pointsPerHour: 0,
        accessRequirement: 'verified_members' as const,
        prohibitedBehaviors: ['No smoking indoors', 'No events after 23:00'],
      },
    },
    {
      name: 'Zuzalu Library Event Space',
      code: 'F1-LIBRARY',
      buildingId: f.id,
      floorId: floorF1.id,
      areaSqm: '60',
      capacitySeated: 30,
      capacityStanding: 40,
      amenities: ['whiteboard', 'wifi', 'ac'],
      services: ['cleaning'],
      rules: {
        allowedEventTypes: ['talk', 'workshop', 'discussion', 'reading'],
        approvalMode: 'venue_manager' as const,
        pointsPerHour: 0,
        accessRequirement: 'verified_members' as const,
        prohibitedBehaviors: ['Keep quiet during sessions'],
      },
    },
    {
      name: '4Seas Nimman 1st floor Coworking space',
      code: 'NM1-COWORK',
      buildingId: nm.id,
      floorId: null,
      areaSqm: '200',
      capacitySeated: 40,
      capacityStanding: 60,
      amenities: ['wifi', 'desks', 'whiteboard', 'kitchen'],
      services: ['cleaning', 'drinks'],
      rules: {
        allowedEventTypes: ['coworking', 'meetup', 'discussion'],
        approvalMode: 'auto' as const,
        pointsPerHour: 0,
        accessRequirement: 'verified_members' as const,
        prohibitedBehaviors: ['No overnight stays'],
      },
    },
  ];

  const existingVenues = await db.select().from(venues);
  for (const seedVenue of venueSeeds) {
    if (existingVenues.some((v) => v.code === seedVenue.code)) continue;
    const [venue] = await db
      .insert(venues)
      .values({
        name: seedVenue.name,
        code: seedVenue.code,
        buildingId: seedVenue.buildingId,
        floorId: seedVenue.floorId,
        areaSqm: seedVenue.areaSqm,
        capacitySeated: seedVenue.capacitySeated,
        capacityStanding: seedVenue.capacityStanding,
        amenities: seedVenue.amenities,
        services: seedVenue.services,
        openingHours: {
          '1': [['09:00', '21:00']],
          '2': [['09:00', '21:00']],
          '3': [['09:00', '21:00']],
          '4': [['09:00', '21:00']],
          '5': [['09:00', '21:00']],
          '6': [['10:00', '22:00']],
          '7': [['10:00', '22:00']],
        },
        status: 'open',
        defaultBufferMin: 30,
      })
      .returning();
    await db.insert(venueRules).values({
      venueId: venue.id,
      version: 1,
      ...seedVenue.rules,
      memberTierDiscount: {},
      freeQuotaApplies: false,
      depositPoints: 0,
      cancellationPolicy: { free_before_hours: 24 },
      maxAdvanceDays: 60,
      minAdvanceHours: 2,
      maxDurationHours: 8,
      maxHoursPerMonth: 40,
    });
    console.log('[seed] venue:', venue.name);
  }

  // ---- a demo member (verified) + one published event ----
  const [member] = await db
    .insert(members)
    .values({
      email: 'demo@4seas.example',
      displayName: 'Demo Host',
      emailVerifiedAt: new Date(),
      timezone: 'Asia/Bangkok',
      roles: [{ scope: 'community:*', role: 'admin' }],
    })
    .onConflictDoNothing()
    .returning();

  if (member) {
    const [venue] = await db.select().from(venues).limit(1);
    if (venue) {
      const start = new Date(Date.now() + 24 * 3600 * 1000);
      const end = new Date(start.getTime() + 2 * 3600 * 1000);
      await db.insert(events).values({
        communityId: communityRow.id,
        title: 'Community Welcome Session',
        description: 'Weekly welcome session for new community members.',
        startAt: start,
        endAt: end,
        timezone: 'Asia/Bangkok',
        eventType: 'in_person',
        venueId: venue.id,
        hostId: member.id,
        status: 'published',
        visibility: 'public',
        tags: ['community'],
        checkinMode: 'qr_rotating',
        checkinClaimCap: 50,
      });
    }
  }

  console.log('[seed] done');
  await pool.end();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});

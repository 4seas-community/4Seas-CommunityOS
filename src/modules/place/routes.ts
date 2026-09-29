/**
 * Place module routes (docs/03 §6):
 *   GET    /api/buildings
 *   POST   /api/buildings                  [admin]
 *   GET    /api/buildings/{id}
 *   PATCH  /api/buildings/{id}             [admin]
 *   POST   /api/floors                     [admin]
 *   PATCH  /api/floors/{id}                [admin]
 *   GET    /api/venues
 *   POST   /api/venues                     [admin]
 *   GET    /api/venues/{id}                (includes current rules)
 *   PATCH  /api/venues/{id}                [venue_manager of that venue]
 *   PUT    /api/venues/{id}/rules          [venue_manager of that venue] (new version)
 *   GET    /api/venues/{id}/availability?from&to
 */
import { readJson, type Router } from '../../lib/http';
import { json, badRequest, unauthorized } from '../../lib/errors';
import * as service from './service';
import type { SessionPayload } from '../../lib/auth/session';

function requireSession(s: SessionPayload | null): SessionPayload {
  if (!s) throw unauthorized();
  return s;
}

export function registerPlaceRoutes(router: Router): void {
  // ------------------------------------------------------ buildings & floors
  router.get('/api/buildings', async () => {
    return json({ buildings: await service.listBuildings() });
  });

  router.get('/api/buildings/:id', async (_req, ctx) => {
    const detail = await service.getBuilding(ctx.params.id);
    return json({ building: detail.building, floors: detail.floors, venues: detail.venues });
  });

  router.post('/api/buildings', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.buildingCreateSchema);
    const building = await service.createBuilding(input, session);
    return json({ building }, 201, { 'x-audit-logged': '1' });
  });

  router.patch('/api/buildings/:id', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.buildingUpdateSchema);
    const building = await service.updateBuilding(ctx.params.id, input, session);
    return json({ building }, 200, { 'x-audit-logged': '1' });
  });

  router.post('/api/floors', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.floorCreateSchema);
    const floor = await service.createFloor(input, session);
    return json({ floor }, 201, { 'x-audit-logged': '1' });
  });

  router.patch('/api/floors/:id', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.floorUpdateSchema);
    const floor = await service.updateFloor(ctx.params.id, input, session);
    return json({ floor }, 200, { 'x-audit-logged': '1' });
  });

  // ---------------------------------------------------------------- venues
  router.get('/api/venues', async (req, ctx) => {
    const buildingId = ctx.url.searchParams.get('building') ?? undefined;
    const floorId = ctx.url.searchParams.get('floor') ?? undefined;
    const amenity = ctx.url.searchParams.get('amenity') ?? undefined;
    const venues = await service.listVenues({ buildingId, floorId, amenity });
    return json({ venues: venues.map(publicVenue) });
  });

  router.post('/api/venues', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.venueCreateSchema);
    const venue = await service.createVenue(input, session);
    return json({ venue: publicVenue(venue) }, 201, { 'x-audit-logged': '1' });
  });

  router.get('/api/venues/:id', async (_req, ctx) => {
    const detail = await service.getVenueWithRules(ctx.params.id);
    return json({
      venue: publicVenue(detail.venue),
      building: detail.building ?? null,
      floor: detail.floor ?? null,
      rules: detail.rules,
    });
  });

  router.patch('/api/venues/:id', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.venueUpdateSchema);
    const venue = await service.updateVenue(ctx.params.id, input, session);
    return json({ venue: publicVenue(venue) }, 200, { 'x-audit-logged': '1' });
  });

  router.put('/api/venues/:id/rules', async (req, ctx) => {
    const session = requireSession(ctx.session);
    const input = await readJson(req, service.venueRulesSchema);
    const rule = await service.putVenueRules(ctx.params.id, input, session);
    return json({ rule }, 200, { 'x-audit-logged': '1' });
  });

  router.get('/api/venues/:id/availability', async (_req, ctx) => {
    const fromParam = ctx.url.searchParams.get('from');
    const toParam = ctx.url.searchParams.get('to');
    if (!fromParam || !toParam) throw badRequest('from and to query params are required (ISO 8601)');
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw badRequest('from/to must be valid dates');
    if (to <= from) throw badRequest('to must be after from');
    const result = await service.getVenueAvailability(ctx.params.id, from, to);
    return json({
      venueId: ctx.params.id,
      timezone: result.timezone,
      open: result.open,
      bufferMin: result.venue.defaultBufferMin,
      slots: result.slots,
    });
  });
}

function publicVenue(v: {
  id: string;
  buildingId: string;
  floorId: string | null;
  name: string;
  code: string;
  areaSqm: number | null;
  capacitySeated: number | null;
  capacityStanding: number | null;
  amenities: string[];
  services: string[];
  openingHours: unknown;
  blackoutDates: string[];
  photos: string[];
  status: string;
  defaultBufferMin: number;
  solDayVenueId: string | null;
}) {
  return {
    ...v,
    areaSqm: v.areaSqm,
    capacity: Math.max(v.capacitySeated ?? 0, v.capacityStanding ?? 0),
  };
}

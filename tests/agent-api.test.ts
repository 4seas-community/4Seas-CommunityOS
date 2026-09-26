/**
 * Agent API (docs/04 §5): key scopes, draft+confirm lifecycle, single use,
 * expiry and idempotent cancel. Drafts are pure DB rows — nothing touches the
 * domain tables until confirm.
 */
import { describe, expect, it } from 'vitest';
import * as agent from '../src/modules/agent/service';
import { db } from '../src/lib/db';
import { agentDrafts } from '../src/modules/agent/schema';
import { eq } from 'drizzle-orm';
import { seedCommunity, seedMember, seedVenue, sessionFor } from './helpers';
import * as eventService from '../src/modules/event/service';

describe('agent keys', () => {
  it('creates a key with scopes and authenticates it', async () => {
    const { keyId, secret } = await agent.createKey({ name: 'claude', scopes: ['events:read', 'events:write'] });
    expect(secret.startsWith('cos_ak_')).toBe(true);
    const key = await agent.authenticate(secret);
    expect(key?.id).toBe(keyId);
    expect(agent.hasScope(key!, 'events:write')).toBe(true);
    expect(agent.hasScope(key!, 'bookings:write')).toBe(false);
  });

  it('rejects an unknown secret', async () => {
    expect(await agent.authenticate('cos_ak_bogus')).toBeNull();
  });

  it('rejects a revoked key', async () => {
    const { keyId, secret } = await agent.createKey({ name: 'temp', scopes: ['events:read'] });
    await agent.revokeKey(keyId);
    expect(await agent.authenticate(secret)).toBeNull();
  });
});

describe('draft + confirm flow', () => {
  async function setup() {
    const community = await seedCommunity();
    const { venue } = await seedVenue(community.id);
    const member = await seedMember('agent-host@test.dev');
    const { secret } = await agent.createKey({ name: 'agent', scopes: ['events:write'], memberId: member.id });
    const key = (await agent.authenticate(secret))!;
    return { community, venue, member, key };
  }

  it('opens a draft without creating the event, then confirms it', async () => {
    const { venue, key } = await setup();
    const payload = {
      title: 'Agent-created workshop',
      startAt: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      endAt: new Date(Date.now() + 50 * 3600 * 1000).toISOString(),
      timezone: 'Asia/Bangkok',
      venueId: venue.id,
      tags: ['workshop'],
    };
    const draft = await agent.openDraft({ key, action: 'create_event', payload, preview: { title: payload.title } });
    expect(agent.draftState(draft)).toBe('open');

    // nothing created yet
    const before = await eventService.listEvents({ view: 'list' });
    expect(before.length).toBe(0);

    const taken = await agent.takeDraftForConfirm(draft.id, key);
    expect(taken.action).toBe('create_event');
    await agent.markConfirmed(draft.id, 'evt-1');

    const [row] = await db.select().from(agentDrafts).where(eq(agentDrafts.id, draft.id)).limit(1);
    expect(row.status).toBe('confirmed');
    expect(row.resultEntityId).toBe('evt-1');
  });

  it('refuses to confirm the same draft twice', async () => {
    const { venue, key } = await setup();
    const draft = await agent.openDraft({ key, action: 'create_event', payload: { venueId: venue.id }, preview: {} });
    await agent.takeDraftForConfirm(draft.id, key);
    await agent.markConfirmed(draft.id, 'evt-2');
    await expect(agent.takeDraftForConfirm(draft.id, key)).rejects.toThrow(/already confirmed/i);
  });

  it('refuses a draft that belongs to another key', async () => {
    const { venue, key } = await setup();
    const draft = await agent.openDraft({ key, action: 'create_event', payload: { venueId: venue.id }, preview: {} });
    const other = (await agent.authenticate((await agent.createKey({ name: 'other', scopes: ['events:write'] })).secret))!;
    await expect(agent.takeDraftForConfirm(draft.id, other)).rejects.toThrow(/not found/i);
  });

  it('expires drafts after their TTL', async () => {
    const { venue, key } = await setup();
    const draft = await agent.openDraft({ key, action: 'create_event', payload: { venueId: venue.id }, preview: {} });
    await db.update(agentDrafts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(agentDrafts.id, draft.id));
    const [stale] = await db.select().from(agentDrafts).where(eq(agentDrafts.id, draft.id)).limit(1);
    expect(agent.draftState(stale)).toBe('expired');
    await expect(agent.takeDraftForConfirm(draft.id, key)).rejects.toThrow(/expired/i);
  });

  it('cancel is idempotent', async () => {
    const { venue, key } = await setup();
    const draft = await agent.openDraft({ key, action: 'create_event', payload: { venueId: venue.id }, preview: {} });
    const first = await agent.cancelDraft(draft.id, key);
    expect(first.status).toBe('canceled');
    const second = await agent.cancelDraft(draft.id, key);
    expect(second.status).toBe('canceled');
  });

  it('cannot cancel an already confirmed draft', async () => {
    const { venue, key } = await setup();
    const draft = await agent.openDraft({ key, action: 'create_event', payload: { venueId: venue.id }, preview: {} });
    await agent.takeDraftForConfirm(draft.id, key);
    await agent.markConfirmed(draft.id, 'evt-3');
    await expect(agent.cancelDraft(draft.id, key)).rejects.toThrow(/already confirmed/i);
  });
});

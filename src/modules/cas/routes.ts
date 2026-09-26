/**
 * /me routes — local session identity + CAS extension surfaces.
 *
 * Email identity is local (docs/02 §1.2 v3); CAS provides points authority
 * (mirrored), check-in tokens and the on-chain account mapping (V2).
 * Telegram binding is verified locally with the official initData algorithm.
 */
import { Router, type Handler } from '../../lib/http';
import { json, badRequest } from '../../lib/errors';
import { verifyInitData } from '../../lib/telegram';
import { readJson } from '../../lib/http';
import { z } from 'zod';
import * as people from '../people/service';
import { casClient } from './index';

const patchSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional(),
  timezone: z.string().min(1).max(64).optional(),
  bio: z.string().max(2000).optional(),
});

const telegramSchema = z.object({ initData: z.string().min(1) });

/** GET /api/me — current member with points mirror (read-only). */
const getMe: Handler = async (_req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const bundle = await people.getMeBundle(ctx.session.sub);
  await people.syncPointsFromCas(bundle.member);
  const refreshed = await people.getMeBundle(ctx.session.sub);
  return json({
    member: people.publicMember(refreshed.member),
    points: refreshed.points,
    ledger: refreshed.ledger,
  });
};

/** PATCH /api/me — update the local profile mirror. */
const patchMe: Handler = async (req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const body = await readJson(req, patchSchema);
  const member = await people.applyProfilePatch(ctx.session.sub, body);
  return json({ member: people.publicMember(member) });
};

/** GET /api/me/points — points mirror; CAS/on-chain is the authority (docs/03 §5). */
const getMyPoints: Handler = async (_req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const member = await people.getMember(ctx.session.sub);
  const mirror = await people.syncPointsFromCas(member);
  return json({ balance: mirror.balance, updatedAt: mirror.updatedAt, authority: 'cas' });
};

/** GET /api/me/telegram — telegram binding status. */
const getMyTelegram: Handler = async (_req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const member = await people.getMember(ctx.session.sub);
  return json({
    bound: Boolean(member.telegramId),
    telegramId: member.telegramId ?? null,
    username: member.telegramUsername ?? null,
  });
};

/** POST /api/me/telegram — bind Telegram via local initData verification. */
const bindMyTelegram: Handler = async (req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const body = await readJson(req, telegramSchema);
  let identity;
  try {
    identity = verifyInitData(body.initData);
  } catch (err) {
    throw badRequest('initData verification failed: ' + (err as Error).message);
  }
  const member = await people.applyTelegramBinding(ctx.session.sub, {
    id: identity.telegramId,
    username: identity.username,
  });
  return json({ bound: true, telegramId: member.telegramId, username: member.telegramUsername });
};

/** DELETE /api/me/telegram — unbind. */
const unbindMyTelegram: Handler = async (_req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const member = await people.clearTelegramBinding(ctx.session.sub);
  return json({ bound: false, telegramId: member.telegramId });
};

/**
 * POST /api/me/wallet — V2 placeholder for the on-chain account mapping.
 * Records the intended mapping locally; CAS/chain sync lands with docs/07.
 */
const walletSchema = z.object({ address: z.string().min(4).max(128) });
const linkWallet: Handler = async (req, ctx) => {
  if (!ctx.session) throw badRequest('Not signed in');
  const body = await readJson(req, walletSchema);
  const member = await people.applyAccountExtension(ctx.session.sub, { walletAddress: body.address });
  return json({ walletAddress: member.walletAddress, note: 'local record; CAS/chain sync is V2 (docs/07)' });
};

export function registerCasRoutes(router: Router): void {
  router.get('/api/me', getMe, 'session');
  router.patch('/api/me', patchMe, 'session');
  router.get('/api/me/points', getMyPoints, 'session');
  router.get('/api/me/telegram', getMyTelegram, 'session');
  router.post('/api/me/telegram', bindMyTelegram, 'session');
  router.delete('/api/me/telegram', unbindMyTelegram, 'session');
  router.post('/api/me/wallet', linkWallet, 'session');
}

// Re-exported for the integration module (4seasbot feed uses the same client).
export { casClient };
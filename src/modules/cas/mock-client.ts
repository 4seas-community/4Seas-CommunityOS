/**
 * MockCasClient — in-memory CAS simulation for local development (docs/05 Q1:
 * "本系统按 06 契约 mock 开发;CAS-M1 对齐后联调").
 * Used automatically when CAS_API_URL / CAS_SERVICE_KEY are not configured.
 *
 * Covers the extension-layer surface only: points ledger, check-in tokens and
 * NFT claim records. Email identity is owned by this system (docs/02 §1.2 v3).
 */
import { createHmac, randomUUID } from 'node:crypto';
import {
  CasError,
  type CasCheckinClaimResult,
  type CasCheckinIssueInput,
  type CasCheckinToken,
  type CasClient,
  type CasNftClaimInput,
  type CasPoints,
  type CasPointsAdjustInput,
} from './types';

interface MockToken {
  tokenId: string;
  eventId: string;
  registrationId: string | null;
  claimUrl: string;
  sig: string;
  expiresAt: number;
  consumedAt: number | null;
  maxUses: number;
  uses: number;
  nftClaimId: string | null;
}

export class MockCasClient implements CasClient {
  private balances = new Map<string, number>();
  private ledger = new Map<string, Array<{ id: string; delta: number; reason: string; refType: string | null; refId: string | null; createdAt: string }>>();
  private checkinTokens = new Map<string, MockToken>();

  private get secret(): string {
    return 'mock-cas-secret';
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }

  private entry(key: string) {
    if (!this.ledger.has(key)) this.ledger.set(key, []);
    return this.ledger.get(key)!;
  }

  async getPoints(key: string): Promise<CasPoints> {
    return { balance: this.balances.get(key) ?? 0, updatedAt: new Date().toISOString() };
  }

  async adjustPoints(key: string, input: CasPointsAdjustInput): Promise<CasPoints> {
    const balance = (this.balances.get(key) ?? 0) + input.delta;
    if (balance < 0) {
      throw new CasError(422, 'unprocessable', 'insufficient points balance');
    }
    this.balances.set(key, balance);
    this.entry(key).push({
      id: randomUUID(),
      delta: input.delta,
      reason: input.reason,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      createdAt: new Date().toISOString(),
    });
    return { balance, updatedAt: new Date().toISOString() };
  }

  async getLedger(since?: string) {
    const all: Array<Record<string, unknown>> = [];
    for (const entries of this.ledger.values()) {
      for (const e of entries) {
        if (!since || e.createdAt > since) all.push({ ...e });
      }
    }
    all.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    return { entries: all.slice(0, 100), nextCursor: null };
  }

  async issueCheckinToken(input: CasCheckinIssueInput): Promise<CasCheckinToken> {
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 300) * 1000);
    const sig = this.sign([tokenId, input.eventId, input.registrationId ?? '', String(Math.floor(expiresAt.getTime() / 1000))].join('|'));
    const sep = input.eventUrl.includes('?') ? '&' : '?';
    const claimUrl = input.eventUrl + sep + 'ck=' + tokenId + '&sig=' + sig;
    this.checkinTokens.set(tokenId, {
      tokenId,
      eventId: input.eventId,
      registrationId: input.registrationId ?? null,
      claimUrl,
      sig,
      expiresAt: expiresAt.getTime(),
      consumedAt: null,
      maxUses: input.maxUses ?? 1,
      uses: 0,
      nftClaimId: null,
    });
    return { tokenId, claimUrl, expiresAt: expiresAt.toISOString() };
  }

  async claimCheckinToken(input: { tokenId: string; sig: string }): Promise<CasCheckinClaimResult> {
    const token = this.checkinTokens.get(input.tokenId);
    if (!token) throw new CasError(404, 'not_found', 'unknown token');
    if (token.expiresAt < Date.now()) throw new CasError(410, 'expired', 'claim url expired');
    if (token.sig !== input.sig) throw new CasError(401, 'unauthorized', 'bad signature');
    if (token.uses >= token.maxUses) throw new CasError(409, 'conflict', 'already claimed');
    token.uses += 1;
    token.consumedAt = Date.now();
    return {
      valid: true,
      eventId: token.eventId,
      registrationId: token.registrationId,
      claimedAt: new Date().toISOString(),
    };
  }

  async getCheckinToken(tokenId: string) {
    const token = this.checkinTokens.get(tokenId);
    if (!token) throw new CasError(404, 'not_found', 'unknown token');
    const status: 'pending' | 'claimed' | 'expired' =
      token.uses >= token.maxUses ? 'claimed' : token.expiresAt < Date.now() ? 'expired' : 'pending';
    return { status, claimedAt: token.consumedAt ? new Date(token.consumedAt).toISOString() : null };
  }

  async recordNftClaim(tokenId: string, input: CasNftClaimInput) {
    const token = this.checkinTokens.get(tokenId);
    if (!token) throw new CasError(404, 'not_found', 'unknown token');
    token.nftClaimId = randomUUID();
    return { nftClaimId: token.nftClaimId };
  }
}

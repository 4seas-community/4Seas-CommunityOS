/**
 * HttpCasClient — real CAS calls for the extension layer (docs/06 §3).
 * All calls are service-scoped (X-Service-Key); email identity stays local.
 */
import { config } from '../../lib/config';
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

interface CasEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-service-key': config.casServiceKey,
    ...(init.headers as Record<string, string>),
  };
  const res = await fetch(config.casApiUrl.replace(/\/$/, '') + path, { ...init, headers });
  const text = await res.text();
  const body: CasEnvelope<T> = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new CasError(res.status, body.error?.code ?? 'cas_error', body.error?.message ?? 'CAS returned ' + res.status);
  }
  return (body.data ?? body) as T;
}

export class HttpCasClient implements CasClient {
  getPoints(key: string) {
    return call<{ balance: number; updated_at: string }>('/v1/users/' + encodeURIComponent(key) + '/points').then(
      (r) => ({ balance: r.balance, updatedAt: r.updated_at }),
    );
  }

  adjustPoints(key: string, input: CasPointsAdjustInput) {
    return call<{ balance: number; updated_at: string }>(
      '/v1/users/' + encodeURIComponent(key) + '/points/adjust',
      { method: 'POST', body: JSON.stringify(input) },
    ).then((r) => ({ balance: r.balance, updatedAt: r.updated_at }));
  }

  getLedger(since?: string) {
    const q = since ? '?since=' + encodeURIComponent(since) : '';
    return call<{ entries: Array<Record<string, unknown>>; next_cursor: string | null }>('/v1/points/ledger' + q).then(
      (r) => ({ entries: r.entries, nextCursor: r.next_cursor }),
    );
  }

  issueCheckinToken(input: CasCheckinIssueInput) {
    return call<{ token_id: string; claim_url: string; expires_at: string }>('/v1/checkin/tokens', {
      method: 'POST',
      body: JSON.stringify({
        event_id: input.eventId,
        registration_id: input.registrationId ?? null,
        event_url: input.eventUrl,
        ttl_seconds: input.ttlSeconds ?? 300,
        max_uses: input.maxUses ?? 1,
      }),
    }).then((r) => ({ tokenId: r.token_id, claimUrl: r.claim_url, expiresAt: r.expires_at }));
  }

  claimCheckinToken(input: { tokenId: string; sig: string }) {
    return call<CasCheckinClaimResult>('/v1/checkin/claim', {
      method: 'POST',
      body: JSON.stringify({ token_id: input.tokenId, sig: input.sig }),
    });
  }

  getCheckinToken(tokenId: string) {
    return call<{ status: 'pending' | 'claimed' | 'expired'; claimed_at: string | null }>(
      '/v1/checkin/tokens/' + encodeURIComponent(tokenId),
    ).then((r) => ({ status: r.status, claimedAt: r.claimed_at }));
  }

  recordNftClaim(tokenId: string, input: CasNftClaimInput) {
    return call<{ nft_claim_id: string }>('/v1/checkin/tokens/' + encodeURIComponent(tokenId) + '/nft-claim', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((r) => ({ nftClaimId: r.nft_claim_id }));
  }
}

/**
 * CAS (Community Account System) client contract — extension layer only.
 *
 * Revised boundary (docs/02 §1.2 v3, docs/06 v2): this system owns email
 * identity, so the CAS client no longer covers register/login. CAS provides:
 *   - points ledger authority (mirrored read-only here)
 *   - check-in tokens (one-time claim URLs, HMAC signed)
 *   - NFT claim records (V2)
 *   - on-chain account mapping (V2: SIWE wallet binding, see docs/07)
 *
 * Source of truth for the wire format: Community-Account-System docs/06 §3.
 */

export interface CasPoints {
  balance: number;
  updatedAt: string;
}

export interface CasPointsAdjustInput {
  delta: number;
  reason: string;
  refType?: string;
  refId?: string;
}

export interface CasCheckinIssueInput {
  eventId: string;
  registrationId?: string | null;
  /** Event page URL the claim URL is built from (docs/06 §3.5). */
  eventUrl: string;
  ttlSeconds?: number;
  maxUses?: number;
}

export interface CasCheckinToken {
  tokenId: string;
  claimUrl: string;
  expiresAt: string;
}

export interface CasCheckinClaimResult {
  valid: boolean;
  eventId: string;
  registrationId: string | null;
  claimedAt: string;
}

export interface CasNftClaimInput {
  nftContract: string;
  tokenId: string;
  txHash: string;
}

export class CasError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'CasError';
  }
}

/** The CAS client contract implemented by both HttpCasClient and MockCasClient. */
export interface CasClient {
  /** GET /v1/users/{key}/points (service token) */
  getPoints(key: string): Promise<CasPoints>;
  /** POST /v1/users/{key}/points/adjust (service token) */
  adjustPoints(key: string, input: CasPointsAdjustInput): Promise<CasPoints>;
  /** GET /v1/points/ledger?since= (service token) */
  getLedger(since?: string): Promise<{ entries: Array<Record<string, unknown>>; nextCursor: string | null }>;
  /** POST /v1/checkin/tokens (service token) */
  issueCheckinToken(input: CasCheckinIssueInput): Promise<CasCheckinToken>;
  /** POST /v1/checkin/claim (participant-facing, signed URL) */
  claimCheckinToken(input: { tokenId: string; sig: string }): Promise<CasCheckinClaimResult>;
  /** GET /v1/checkin/tokens/{id} */
  getCheckinToken(tokenId: string): Promise<{ status: 'pending' | 'claimed' | 'expired'; claimedAt: string | null }>;
  /** POST /v1/checkin/tokens/{id}/nft-claim (V2 placeholder in CAS) */
  recordNftClaim(tokenId: string, input: CasNftClaimInput): Promise<{ nftClaimId: string }>;
}

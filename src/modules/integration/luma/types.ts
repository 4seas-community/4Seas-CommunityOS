/**
 * Luma API types (docs/04 §2.2 field mapping).
 * Source: https://docs.luma.com — create/update event, cancel (2-step), images.
 */

export interface LumaGeoAddress {
  type: 'manual' | 'google' | 'lookup';
  address?: string;
  place_id?: string;
  query?: string;
}

export interface LumaCreateEventInput {
  name: string;
  start_at: string;
  end_at: string;
  timezone: string;
  description_md?: string;
  cover_url?: string;
  geo_address_json?: LumaGeoAddress | null;
  meeting_url?: string;
  max_capacity?: number | null;
  visibility?: 'public' | 'private' | 'members';
  waitlist_status?: 'enabled' | 'disabled';
  registration_questions?: unknown[];
  ticket_types?: unknown[];
}

export interface LumaEvent {
  api_id: string;
  name: string;
  start_at: string;
  end_at: string;
  url?: string;
  cover_url?: string;
}

export interface LumaUploadUrl {
  upload_url: string;
  file_url: string;
}

export interface LumaCancelToken {
  cancellation_token: string;
}

export class LumaError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'LumaError';
  }
}

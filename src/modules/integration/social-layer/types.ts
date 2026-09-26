/**
 * Social Layer (sola.day) API types — from the open-source SDK
 * (sociallayer-im/seastar-app packages/sola-sdk/src/event). Undocumented but
 * stable enough to integrate against; the sync layer tolerates field drift.
 */

export interface SolaEventBody {
  title: string;
  content?: string;
  notes?: string;
  image_url?: string | null;
  start_time: string;
  end_time: string;
  timezone: string;
  status?: 'open' | 'closed';
  visibility?: 'public' | 'private';
  place_id?: string | null;
  venue_id?: string | null;
  meeting_url?: string | null;
  external_url?: string | null;
  max_participant?: number | null;
  require_approval?: boolean;
  tags?: string[];
  group_id?: string;
}

export interface SolaEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
}

export class SolaError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'SolaError';
  }
}

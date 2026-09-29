-- Hand-written migration: drizzle-kit cannot express exclusion constraints.
--
-- Why: the application-level conflict pre-check in booking/service.ts has a
-- TOCTOU window, so two concurrent requests can both pass it. This constraint is
-- the atomic guard the booking code has referred to since docs/03 §4.2.
--
-- Scope: only "active" statuses block a slot. Rejected/canceled/no_show rows do
-- not, so a freed slot can be rebooked.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist (
  "venue_id" WITH =,
  tstzrange("start_at", "end_at", '[)') WITH &&
) WHERE ("status" IN ('pending', 'approved', 'checked_in', 'completed'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_time_order" CHECK ("end_at" > "start_at");

CREATE TABLE `buildings` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`geo` text,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`cover_image` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "buildings_status_check" CHECK("status" IN ('active', 'maintenance', 'closed'))
);
--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `communities_slug_unique` ON `communities` (`slug`);--> statement-breakpoint
CREATE TABLE `floors` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`building_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`map_asset` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `venue_rules` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`venue_id` text NOT NULL,
	`version` integer NOT NULL,
	`allowed_event_types` text DEFAULT '[]' NOT NULL,
	`approval_mode` text DEFAULT 'auto' NOT NULL,
	`points_per_hour` integer DEFAULT 0 NOT NULL,
	`member_tier_discount` text DEFAULT '{}' NOT NULL,
	`free_quota_applies` integer DEFAULT false NOT NULL,
	`deposit_points` integer DEFAULT 0 NOT NULL,
	`max_advance_days` integer,
	`min_advance_hours` integer,
	`max_duration_hours` integer,
	`max_hours_per_month` integer,
	`cancellation_policy` text DEFAULT '{}' NOT NULL,
	`prohibited_behaviors` text DEFAULT '[]' NOT NULL,
	`access_requirement` text DEFAULT 'verified_members' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "venue_rules_approval_mode_check" CHECK("approval_mode" IN ('auto', 'venue_manager', 'community_admin')),
	CONSTRAINT "venue_rules_access_check" CHECK("access_requirement" IN ('verified_members', 'roles', 'public')),
	CONSTRAINT "venue_rules_points_check" CHECK("points_per_hour" >= 0),
	CONSTRAINT "venue_rules_deposit_check" CHECK("deposit_points" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_rules_venue_version_unique` ON `venue_rules` (`venue_id`,`version`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`building_id` text NOT NULL,
	`floor_id` text,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`area_sqm` real,
	`capacity_seated` integer,
	`capacity_standing` integer,
	`amenities` text DEFAULT '[]' NOT NULL,
	`services` text DEFAULT '[]' NOT NULL,
	`opening_hours` text DEFAULT '{}' NOT NULL,
	`blackout_dates` text DEFAULT '[]' NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`default_buffer_min` integer DEFAULT 0 NOT NULL,
	`sol_day_venue_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "venues_status_check" CHECK("status" IN ('open', 'maintenance', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venues_code_unique` ON `venues` (`code`);--> statement-breakpoint
CREATE TABLE `checkin_tokens` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`event_id` text NOT NULL,
	`registration_id` text,
	`claim_url` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`nft_claim_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `checkin_tokens_event_idx` ON `checkin_tokens` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`community_id` text NOT NULL,
	`program_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`event_type` text DEFAULT 'in_person' NOT NULL,
	`venue_id` text,
	`venue_snapshot` text,
	`external_location` text,
	`geo` text,
	`transport_info` text DEFAULT '' NOT NULL,
	`meeting_url` text,
	`banner_url` text,
	`suggested_attendees` integer,
	`max_capacity` integer,
	`is_paid` text DEFAULT 'free' NOT NULL,
	`price_info` text,
	`entry_requirements` text DEFAULT '' NOT NULL,
	`registration_questions` text DEFAULT '[]' NOT NULL,
	`approval_required` integer DEFAULT false NOT NULL,
	`waitlist_enabled` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`host_id` text NOT NULL,
	`co_host_ids` text DEFAULT '[]' NOT NULL,
	`created_via` text DEFAULT 'web' NOT NULL,
	`checkin_mode` text DEFAULT 'qr_rotating' NOT NULL,
	`checkin_claim_cap` integer,
	`sync_state` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`host_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "events_status_check" CHECK("status" IN ('draft', 'pending_review', 'published', 'ongoing', 'ended', 'archived', 'canceled')),
	CONSTRAINT "events_type_check" CHECK("event_type" IN ('in_person', 'online', 'hybrid')),
	CONSTRAINT "events_visibility_check" CHECK("visibility" IN ('public', 'members', 'private')),
	CONSTRAINT "events_payment_check" CHECK("is_paid" IN ('free', 'fixed', 'pwyf')),
	CONSTRAINT "events_created_via_check" CHECK("created_via" IN ('web', 'agent', 'telegram')),
	CONSTRAINT "events_checkin_mode_check" CHECK("checkin_mode" IN ('qr_rotating', 'qr_static', 'none')),
	CONSTRAINT "events_time_order_check" CHECK("end_at" > "start_at")
);
--> statement-breakpoint
CREATE INDEX `events_start_at_idx` ON `events` (`start_at`);--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`event_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`answers` text DEFAULT '{}' NOT NULL,
	`checked_in_at` integer,
	`source` text DEFAULT 'web' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "registrations_status_check" CHECK("status" IN ('pending', 'approved', 'waitlist', 'declined', 'canceled')),
	CONSTRAINT "registrations_source_check" CHECK("source" IN ('web', 'agent', 'telegram'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_member_unique` ON `registrations` (`event_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`community_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`venue_id` text NOT NULL,
	`event_id` text,
	`member_id` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`attendees_count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rule_version` integer DEFAULT 1 NOT NULL,
	`points_charged` integer DEFAULT 0 NOT NULL,
	`deposit_points` integer DEFAULT 0 NOT NULL,
	`approved_by` text,
	`decision_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bookings_status_check" CHECK("status" IN ('pending', 'approved', 'rejected', 'canceled', 'checked_in', 'completed', 'no_show')),
	CONSTRAINT "bookings_time_order_check" CHECK("end_at" > "start_at"),
	CONSTRAINT "bookings_attendees_check" CHECK("attendees_count" >= 0),
	CONSTRAINT "bookings_points_check" CHECK("points_charged" >= 0),
	CONSTRAINT "bookings_deposit_check" CHECK("deposit_points" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bookings_venue_start_idx` ON `bookings` (`venue_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`cas_user_id` text,
	`email` text NOT NULL,
	`email_verified_at` integer,
	`display_name` text,
	`avatar_url` text,
	`bio` text,
	`timezone` text DEFAULT 'Asia/Bangkok' NOT NULL,
	`telegram_id` text,
	`telegram_username` text,
	`wallet_address` text,
	`tier` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "members_status_check" CHECK("status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_cas_user_id_unique` ON `members` (`cas_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_telegram_id_unique` ON `members` (`telegram_id`);--> statement-breakpoint
CREATE TABLE `points_ledger_local` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`member_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`ref_type` text,
	`ref_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `points_mirror` (
	`member_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_synced_ledger_id` text,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`member_id` text,
	`target` text DEFAULT 'broadcast' NOT NULL,
	`channel` text DEFAULT 'telegram' NOT NULL,
	`template` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`scheduled_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_outbox_channel_check" CHECK("channel" IN ('telegram', 'email')),
	CONSTRAINT "notification_outbox_status_check" CHECK("status" IN ('scheduled', 'pending', 'delivered', 'failed')),
	CONSTRAINT "notification_outbox_retry_check" CHECK("retry_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `notification_outbox_status_idx` ON `notification_outbox` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `sync_records` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_id` text,
	`external_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`synced_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "sync_records_platform_check" CHECK("platform" IN ('luma', 'social_layer')),
	CONSTRAINT "sync_records_status_check" CHECK("status" IN ('pending', 'syncing', 'synced', 'failed', 'dead_letter', 'canceled', 'outdated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_records_entity_platform_unique` ON `sync_records` (`entity_type`,`entity_id`,`platform`);--> statement-breakpoint
CREATE INDEX `sync_records_status_idx` ON `sync_records` (`status`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "auth_tokens_purpose_check" CHECK("purpose" IN ('verify_email', 'login'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `agent_drafts` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`key_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`preview` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`result_entity_id` text,
	`expires_at` integer NOT NULL,
	`confirmed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`key_id`) REFERENCES `agent_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_drafts_status_check" CHECK("status" IN ('open', 'confirmed', 'canceled', 'expired'))
);
--> statement-breakpoint
CREATE INDEX `agent_drafts_key_idx` ON `agent_drafts` (`key_id`,`status`);--> statement-breakpoint
CREATE TABLE `agent_keys` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`member_id` text,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_keys_key_hash_unique` ON `agent_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `agent_keys_hash_idx` ON `agent_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))) NOT NULL,
	`actor_type` text DEFAULT 'anonymous' NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`before` text,
	`after` text,
	`draft_id` text,
	`ip` text,
	`ua` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "audit_logs_actor_type_check" CHECK("actor_type" IN ('user', 'agent', 'service', 'system', 'anonymous'))
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);

-- ---------------------------------------------------------------------------
-- Hand-written section: the triggers below are not expressible in drizzle-kit.
-- Keep them in the initial migration; generate later changes as 0001+.
-- ---------------------------------------------------------------------------
--> statement-breakpoint
CREATE TRIGGER `bookings_no_overlap_insert`
BEFORE INSERT ON `bookings`
FOR EACH ROW
WHEN NEW.status IN ('pending', 'approved', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap')
  WHERE EXISTS (
    SELECT 1
    FROM `bookings` AS b
    WHERE b.venue_id = NEW.venue_id
      AND b.status IN ('pending', 'approved', 'checked_in')
      AND b.start_at < NEW.end_at
      AND b.end_at > NEW.start_at
  );
END;
--> statement-breakpoint
CREATE TRIGGER `bookings_no_overlap_update`
BEFORE UPDATE ON `bookings`
FOR EACH ROW
WHEN NEW.status IN ('pending', 'approved', 'checked_in')
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap')
  WHERE EXISTS (
    SELECT 1
    FROM `bookings` AS b
    WHERE b.venue_id = NEW.venue_id
      AND b.id <> NEW.id
      AND b.status IN ('pending', 'approved', 'checked_in')
      AND b.start_at < NEW.end_at
      AND b.end_at > NEW.start_at
  );
END;

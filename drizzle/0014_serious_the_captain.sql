CREATE TABLE `auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`outcome` text NOT NULL,
	`channel` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_auth_events_user_created` ON `auth_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_events_type_created` ON `auth_events` (`event_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`credential_reference` text,
	`enrolled_at` integer NOT NULL,
	`verified_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_factors_user_status` ON `auth_factors` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `auth_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`linked_at` integer NOT NULL,
	`last_authenticated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_identities_provider_subject` ON `auth_identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `idx_auth_identities_user_status` ON `auth_identities` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`assurance_level` text DEFAULT 'aal1' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_sessions_token_hash` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user_status_expires` ON `auth_sessions` (`user_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `contact_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`normalized_value` text NOT NULL,
	`display_value` text NOT NULL,
	`status` text DEFAULT 'unverified' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contact_methods_kind_value` ON `contact_methods` (`kind`,`normalized_value`);--> statement-breakpoint
CREATE INDEX `idx_contact_methods_user_status` ON `contact_methods` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `message_delivery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `outbound_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_message_delivery_provider_event` ON `message_delivery_events` (`provider`,`provider_event_id`);--> statement-breakpoint
CREATE INDEX `idx_message_delivery_message_occurred` ON `message_delivery_events` (`message_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `channel`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outbound_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_contact_method_id` text NOT NULL,
	`channel` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`content_classification` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error_code` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_contact_method_id`) REFERENCES `contact_methods`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outbound_messages_dedupe` ON `outbound_messages` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_outbound_messages_status_next_attempt` ON `outbound_messages` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_outbound_messages_user_created` ON `outbound_messages` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webhook_receipts_provider_event` ON `webhook_receipts` (`provider`,`provider_event_id`);
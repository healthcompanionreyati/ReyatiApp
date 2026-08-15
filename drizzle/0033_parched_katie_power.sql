CREATE TABLE `pilot_readiness_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `pilot_readiness_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_readiness_review_events_review_created` ON `pilot_readiness_review_events` (`review_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_readiness_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`cycle_label` text NOT NULL,
	`scope` text DEFAULT 'controlled_provider_pilot' NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`cleared_gate_count` integer NOT NULL,
	`total_gate_count` integer NOT NULL,
	`blocked_gate_count` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`decision` text DEFAULT 'pending' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pilot_readiness_reviews_status_updated` ON `pilot_readiness_reviews` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pilot_readiness_reviews_preparer_created` ON `pilot_readiness_reviews` (`prepared_by_user_id`,`created_at`);--> statement-breakpoint
PRAGMA optimize;

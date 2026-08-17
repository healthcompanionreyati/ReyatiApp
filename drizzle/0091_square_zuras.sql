CREATE TABLE `integration_access_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `integration_access_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_access_review_events` ON `integration_access_review_events` (`review_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `integration_access_review_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`credentials_issued` integer NOT NULL,
	`scopes_changed` integer NOT NULL,
	`access_revoked` integer NOT NULL,
	`sessions_terminated` integer NOT NULL,
	`external_systems_contacted` integer NOT NULL,
	`result` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_integration_access_review_rehearsal` ON `integration_access_review_rehearsals` (`executed_at`);--> statement-breakpoint
CREATE TABLE `integration_access_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`access_reference_hash` text NOT NULL,
	`principal_class` text NOT NULL,
	`scope_band` text NOT NULL,
	`owner_state` text NOT NULL,
	`review_cadence` text NOT NULL,
	`review_evidence` text NOT NULL,
	`expiry_posture` text NOT NULL,
	`segregation_state` text NOT NULL,
	`anomaly_review` text NOT NULL,
	`revocation_readiness` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`reviewed_by_user_id` text,
	`decision_code` text,
	`submitted_at` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_integration_access_reference` ON `integration_access_reviews` (`access_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_integration_access_review_posture` ON `integration_access_reviews` (`principal_class`,`scope_band`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;

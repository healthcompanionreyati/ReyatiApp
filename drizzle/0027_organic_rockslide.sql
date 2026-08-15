CREATE TABLE `recovery_rehearsal_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rehearsal_id`) REFERENCES `recovery_rehearsals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_recovery_rehearsal_events_rehearsal_created` ON `recovery_rehearsal_events` (`rehearsal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `recovery_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`scope` text NOT NULL,
	`environment` text DEFAULT 'isolated_hosted_recovery' NOT NULL,
	`data_classification` text DEFAULT 'synthetic_only' NOT NULL,
	`owner_user_id` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`target_rto_minutes` integer NOT NULL,
	`target_rpo_minutes` integer NOT NULL,
	`planned_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`measured_rto_minutes` integer,
	`recovery_point_age_minutes` integer,
	`integrity_status` text DEFAULT 'pending' NOT NULL,
	`evidence_reference` text,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`reviewer_user_id` text,
	`reviewed_at` integer,
	`review_note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recovery_rehearsals_reference` ON `recovery_rehearsals` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_recovery_rehearsals_status_planned` ON `recovery_rehearsals` (`status`,`planned_at`);--> statement-breakpoint
CREATE INDEX `idx_recovery_rehearsals_review_completed` ON `recovery_rehearsals` (`review_status`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_recovery_rehearsals_owner_status` ON `recovery_rehearsals` (`owner_user_id`,`status`);--> statement-breakpoint
PRAGMA optimize;

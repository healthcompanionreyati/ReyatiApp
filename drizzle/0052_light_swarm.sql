CREATE TABLE `dependent_transition_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`dependent_id` text NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`adult_accounts_created` integer NOT NULL,
	`authorities_activated` integer NOT NULL,
	`emergency_access_grants` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`dependent_id`) REFERENCES `dependent_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_dependent_transition_rehearsals_dependent_executed` ON `dependent_transition_rehearsals` (`dependent_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `idx_dependent_transition_rehearsals_result_executed` ON `dependent_transition_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `guardian_nominations` (
	`id` text PRIMARY KEY NOT NULL,
	`dependent_id` text NOT NULL,
	`nominated_by_user_id` text NOT NULL,
	`nominee_email` text NOT NULL,
	`token_hash` text NOT NULL,
	`authority_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`accepted_by_user_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dependent_id`) REFERENCES `dependent_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`nominated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guardian_nominations_token` ON `guardian_nominations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_guardian_nominations_dependent_status` ON `guardian_nominations` (`dependent_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_guardian_nominations_email_status` ON `guardian_nominations` (`nominee_email`,`status`);
--> statement-breakpoint
PRAGMA optimize;

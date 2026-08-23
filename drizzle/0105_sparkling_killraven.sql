CREATE TABLE `payment_activation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`window_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`event_code` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`provider_mode` text,
	`coded_details_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`window_id`) REFERENCES `payment_activation_windows`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_payment_activation_event_window_created` ON `payment_activation_events` (`window_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_activation_event_code_created` ON `payment_activation_events` (`event_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_activation_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`go_live_review_id` text NOT NULL,
	`go_live_review_version` integer NOT NULL,
	`prepared_by_user_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`target_environment` text DEFAULT 'production' NOT NULL,
	`window_starts_at` integer NOT NULL,
	`window_ends_at` integer NOT NULL,
	`change_owner` text NOT NULL,
	`monitoring_owner` text NOT NULL,
	`rollback_owner` text NOT NULL,
	`monitoring_minutes` integer NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_by_user_id` text,
	`review_note` text,
	`reviewed_at` integer,
	`opened_by_user_id` text,
	`opened_at` integer,
	`closed_by_user_id` text,
	`closed_at` integer,
	`outcome` text,
	`provider_mode_at_close` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`go_live_review_id`) REFERENCES `payment_go_live_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prepared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_activation_request` ON `payment_activation_windows` (`prepared_by_user_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_activation_status_window` ON `payment_activation_windows` (`status`,`window_starts_at`,`window_ends_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_activation_go_live` ON `payment_activation_windows` (`go_live_review_id`,`created_at`);
CREATE TABLE `operational_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`request_limit` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`window_ends_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_operational_rate_limits_window_end` ON `operational_rate_limits` (`window_ends_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_rate_limits_scope_updated` ON `operational_rate_limits` (`scope`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;

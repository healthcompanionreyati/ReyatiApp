CREATE TABLE `operational_incident_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `operational_incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_operational_incident_updates_incident_created` ON `operational_incident_updates` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_incident_updates_actor_created` ON `operational_incident_updates` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `operational_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`declared_by_user_id` text NOT NULL,
	`assigned_to_user_id` text NOT NULL,
	`response_due_at` integer NOT NULL,
	`acknowledged_at` integer,
	`contained_at` integer,
	`resolved_at` integer,
	`closed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`declared_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_operational_incidents_reference` ON `operational_incidents` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_operational_incidents_status_severity_updated` ON `operational_incidents` (`status`,`severity`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_operational_incidents_assignee_status` ON `operational_incidents` (`assigned_to_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_operational_incidents_response_due` ON `operational_incidents` (`status`,`response_due_at`);--> statement-breakpoint
PRAGMA optimize;

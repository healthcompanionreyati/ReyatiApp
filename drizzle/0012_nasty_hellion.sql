CREATE TABLE `support_case_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_kind` text NOT NULL CHECK (`author_kind` IN ('requester', 'agent')),
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `support_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_support_case_messages_case_created` ON `support_case_messages` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`requester_user_id` text NOT NULL,
	`assigned_to_user_id` text,
	`category` text NOT NULL CHECK (`category` IN ('booking', 'payment', 'complaint', 'privacy', 'safety')),
	`subject` text NOT NULL,
	`description` text NOT NULL,
	`related_reference` text,
	`privacy_request_type` text,
	`priority` text DEFAULT 'normal' NOT NULL CHECK (`priority` IN ('normal', 'high', 'critical')),
	`status` text DEFAULT 'open' NOT NULL CHECK (`status` IN ('open', 'in_progress', 'waiting_requester', 'waiting_support', 'resolved', 'closed')),
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_support_cases_reference` ON `support_cases` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_support_cases_requester_updated` ON `support_cases` (`requester_user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_support_cases_status_priority_updated` ON `support_cases` (`status`,`priority`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_support_cases_assignee_status` ON `support_cases` (`assigned_to_user_id`,`status`);--> statement-breakpoint
PRAGMA optimize;

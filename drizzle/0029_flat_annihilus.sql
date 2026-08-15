CREATE TABLE `legal_hold_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`hold_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`hold_id`) REFERENCES `legal_hold_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_legal_hold_order_events_hold_created` ON `legal_hold_order_events` (`hold_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `legal_hold_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`record_class` text NOT NULL,
	`scope_type` text NOT NULL,
	`protected_reference` text NOT NULL,
	`reason_code` text NOT NULL,
	`authority_reference` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`placed_by_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`placed_at` integer NOT NULL,
	`review_due_at` integer NOT NULL,
	`release_requested_by_user_id` text,
	`release_requested_at` integer,
	`released_by_user_id` text,
	`released_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`placed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`released_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_legal_hold_orders_reference` ON `legal_hold_orders` (`reference`);--> statement-breakpoint
CREATE INDEX `idx_legal_hold_orders_status_review` ON `legal_hold_orders` (`status`,`review_due_at`);--> statement-breakpoint
CREATE INDEX `idx_legal_hold_orders_record_scope_status` ON `legal_hold_orders` (`record_class`,`scope_type`,`protected_reference`,`status`);--> statement-breakpoint
CREATE INDEX `idx_legal_hold_orders_owner_status` ON `legal_hold_orders` (`owner_user_id`,`status`);--> statement-breakpoint
PRAGMA optimize;

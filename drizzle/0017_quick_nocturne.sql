PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_outbound_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_contact_method_id` text,
	`recipient_address` text,
	`channel` text NOT NULL,
	`template_id` text NOT NULL,
	`template_version` integer NOT NULL,
	`template_data_json` text DEFAULT '{}' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`content_classification` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error_code` text,
	`provider_message_id` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recipient_contact_method_id`) REFERENCES `contact_methods`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_outbound_messages`("id", "user_id", "recipient_contact_method_id", "recipient_address", "channel", "template_id", "template_version", "template_data_json", "locale", "content_classification", "dedupe_key", "status", "attempt_count", "next_attempt_at", "last_error_code", "provider_message_id", "sent_at", "created_at", "updated_at") SELECT "id", "user_id", "recipient_contact_method_id", NULL, "channel", "template_id", "template_version", "template_data_json", "locale", "content_classification", "dedupe_key", "status", "attempt_count", "next_attempt_at", "last_error_code", NULL, "sent_at", "created_at", "updated_at" FROM `outbound_messages`;--> statement-breakpoint
DROP TABLE `outbound_messages`;--> statement-breakpoint
ALTER TABLE `__new_outbound_messages` RENAME TO `outbound_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outbound_messages_dedupe` ON `outbound_messages` (`dedupe_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outbound_messages_provider_message` ON `outbound_messages` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `idx_outbound_messages_status_next_attempt` ON `outbound_messages` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `idx_outbound_messages_user_created` ON `outbound_messages` (`user_id`,`created_at`);

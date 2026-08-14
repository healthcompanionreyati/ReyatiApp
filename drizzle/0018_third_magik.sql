CREATE TABLE `email_delivery_suppressions` (
	`address_hash` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`source_provider` text NOT NULL,
	`source_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

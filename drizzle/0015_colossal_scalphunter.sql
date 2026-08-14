ALTER TABLE `outbound_messages` ADD `template_data_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `outbound_messages` ADD `locale` text DEFAULT 'en' NOT NULL;
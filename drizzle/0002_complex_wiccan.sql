CREATE TABLE `provider_availability_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`service_location_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`timezone` text DEFAULT 'Asia/Qatar' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_location_id`) REFERENCES `provider_service_locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_provider_availability_service_day_status` ON `provider_availability_windows` (`service_location_id`,`weekday`,`status`);--> statement-breakpoint
CREATE TABLE `provider_service_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`facility_id` text,
	`mode` text NOT NULL,
	`fee_qar` integer NOT NULL,
	`slot_duration_minutes` integer DEFAULT 30 NOT NULL,
	`accepting_new_patients` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_provider_service_locations_provider_status` ON `provider_service_locations` (`provider_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_provider_service_locations_facility_status` ON `provider_service_locations` (`facility_id`,`status`);--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `languages_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `bio_en` text;--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `bio_ar` text;--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `years_experience` integer;--> statement-breakpoint
ALTER TABLE `provider_profiles` ADD `published_at` integer;
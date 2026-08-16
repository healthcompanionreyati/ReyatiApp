CREATE TABLE `appointment_waitlist_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `appointment_waitlist_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_waitlist_events_request_created` ON `appointment_waitlist_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `appointment_waitlist_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`scheduled_start` integer NOT NULL,
	`scheduled_end` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'offered' NOT NULL,
	`appointment_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `appointment_waitlist_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_waitlist_offers_request_status_created` ON `appointment_waitlist_offers` (`request_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_waitlist_offers_status_expires` ON `appointment_waitlist_offers` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `appointment_waitlist_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`requests_created` integer NOT NULL,
	`offers_created` integer NOT NULL,
	`appointments_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_waitlist_rehearsals_result_executed` ON `appointment_waitlist_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `appointment_waitlist_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`service_location_id` text NOT NULL,
	`facility_id` text,
	`mode` text NOT NULL,
	`earliest_date` text NOT NULL,
	`latest_date` text NOT NULL,
	`time_preference` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_location_id`) REFERENCES `provider_service_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_waitlist_patient_status_updated` ON `appointment_waitlist_requests` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_waitlist_provider_status_created` ON `appointment_waitlist_requests` (`provider_id`,`status`,`created_at`);--> statement-breakpoint
PRAGMA optimize;

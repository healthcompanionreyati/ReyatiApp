CREATE TABLE `digital_queue_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`service_location_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`status` text DEFAULT 'checked_in' NOT NULL,
	`queue_position` integer,
	`delay_minutes` integer,
	`source_label` text NOT NULL,
	`source_updated_at` integer NOT NULL,
	`checked_in_at` integer NOT NULL,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_location_id`) REFERENCES `provider_service_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_digital_queue_entries_appointment` ON `digital_queue_entries` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_digital_queue_entries_location_status_updated` ON `digital_queue_entries` (`service_location_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_digital_queue_entries_patient_checked_in` ON `digital_queue_entries` (`patient_id`,`checked_in_at`);--> statement-breakpoint
CREATE TABLE `digital_queue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`queue_position` integer,
	`delay_minutes` integer,
	`source_label` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `digital_queue_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_digital_queue_events_entry_created` ON `digital_queue_events` (`entry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `digital_queue_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`service_location_id` text NOT NULL,
	`facility_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`check_in_open_minutes` integer DEFAULT 90 NOT NULL,
	`check_in_close_minutes` integer DEFAULT 30 NOT NULL,
	`stale_after_seconds` integer DEFAULT 300 NOT NULL,
	`source_label` text DEFAULT 'Reception desk' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_location_id`) REFERENCES `provider_service_locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_digital_queue_locations_service` ON `digital_queue_locations` (`service_location_id`);--> statement-breakpoint
CREATE INDEX `idx_digital_queue_locations_facility_enabled` ON `digital_queue_locations` (`facility_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `digital_queue_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`entries_created` integer DEFAULT 0 NOT NULL,
	`appointments_changed` integer DEFAULT 0 NOT NULL,
	`external_messages_sent` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_digital_queue_rehearsals_result_executed` ON `digital_queue_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `home_care_concerns` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `home_care_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_home_care_concerns_request_status` ON `home_care_concerns` (`request_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_home_care_concerns_status_created` ON `home_care_concerns` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `home_care_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`requests_created` integer NOT NULL,
	`assignments_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`location_events_created` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_home_care_rehearsals_result_executed` ON `home_care_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `home_care_request_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `home_care_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_home_care_events_request_created` ON `home_care_request_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `home_care_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`service_id` text NOT NULL,
	`address_line` text NOT NULL,
	`area` text NOT NULL,
	`access_instructions` text DEFAULT '' NOT NULL,
	`accessibility_needs` text DEFAULT '' NOT NULL,
	`intake_json` text NOT NULL,
	`requested_window_start` integer NOT NULL,
	`requested_window_end` integer NOT NULL,
	`arrival_window_start` integer,
	`arrival_window_end` integer,
	`assigned_worker_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`rejection_reason_code` text,
	`completion_summary` text,
	`completion_evidence_reference` text,
	`payment_status` text DEFAULT 'not_started' NOT NULL,
	`feedback_status` text DEFAULT 'not_requested' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`service_id`) REFERENCES `home_care_services`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_worker_id`) REFERENCES `home_care_workers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_home_care_requests_patient_created` ON `home_care_requests` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_home_care_requests_org_status_updated` ON `home_care_requests` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_home_care_requests_worker_status` ON `home_care_requests` (`assigned_worker_id`,`status`);--> statement-breakpoint
CREATE TABLE `home_care_services` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`category` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`description_en` text NOT NULL,
	`description_ar` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`fee_qar` integer NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`allow_en_route_status` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_home_care_services_org_status` ON `home_care_services` (`organization_id`,`approval_status`,`status`);--> statement-breakpoint
CREATE INDEX `idx_home_care_services_category_status` ON `home_care_services` (`category`,`approval_status`,`status`);--> statement-breakpoint
CREATE TABLE `home_care_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider_profile_id` text,
	`display_name` text NOT NULL,
	`role_label_en` text NOT NULL,
	`role_label_ar` text NOT NULL,
	`credential_type` text NOT NULL,
	`credential_reference` text NOT NULL,
	`credential_status` text DEFAULT 'pending' NOT NULL,
	`approved_categories_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_profile_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_home_care_workers_credential` ON `home_care_workers` (`credential_reference`);--> statement-breakpoint
CREATE INDEX `idx_home_care_workers_org_credential_status` ON `home_care_workers` (`organization_id`,`credential_status`,`status`);--> statement-breakpoint
CREATE TABLE `laboratory_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `laboratory_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_laboratory_order_events_order_created` ON `laboratory_order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `laboratory_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`ordering_provider_id` text NOT NULL,
	`laboratory_organization_id` text,
	`test_names_json` text NOT NULL,
	`clinical_context` text NOT NULL,
	`patient_instructions` text NOT NULL,
	`priority` text DEFAULT 'routine' NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`provider_attestation_version` text NOT NULL,
	`signed_by_user_id` text NOT NULL,
	`signed_at` integer NOT NULL,
	`partner_clarification` text,
	`scheduled_at` integer,
	`rejection_reason_code` text,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ordering_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`laboratory_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`signed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_laboratory_orders_provider_appointment` ON `laboratory_orders` (`ordering_provider_id`,`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_laboratory_orders_patient_status_updated` ON `laboratory_orders` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_laboratory_orders_partner_status_updated` ON `laboratory_orders` (`laboratory_organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `laboratory_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`orders_created` integer NOT NULL,
	`results_created` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_laboratory_rehearsals_result_executed` ON `laboratory_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `laboratory_results` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`source` text DEFAULT 'synthetic_demo' NOT NULL,
	`result_text` text NOT NULL,
	`summary_label` text NOT NULL,
	`abnormal_flag` text DEFAULT 'none' NOT NULL,
	`urgent` integer DEFAULT false NOT NULL,
	`partner_protocol_confirmed` integer DEFAULT false NOT NULL,
	`issued_by_user_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `laboratory_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_laboratory_results_order` ON `laboratory_results` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_laboratory_results_urgent_issued` ON `laboratory_results` (`urgent`,`issued_at`);--> statement-breakpoint
PRAGMA optimize;

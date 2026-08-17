CREATE TABLE `encounter_amendments` (
	`id` text PRIMARY KEY NOT NULL,
	`encounter_note_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`amendment_type` text NOT NULL,
	`patient_summary` text NOT NULL,
	`clinical_content` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_text` text NOT NULL,
	`source_request_id` text,
	`author_user_id` text NOT NULL,
	`attestation_version` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`encounter_note_id`) REFERENCES `encounter_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_amendments_note_created` ON `encounter_amendments` (`encounter_note_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_encounter_amendments_appointment_created` ON `encounter_amendments` (`appointment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `encounter_continuity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`resource_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_continuity_events_resource_created` ON `encounter_continuity_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_encounter_continuity_events_appointment_created` ON `encounter_continuity_events` (`appointment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `encounter_continuity_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`amendments_created` integer DEFAULT 0 NOT NULL,
	`notes_overwritten` integer DEFAULT 0 NOT NULL,
	`tasks_created` integer DEFAULT 0 NOT NULL,
	`external_messages_sent` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_continuity_rehearsals_result_executed` ON `encounter_continuity_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `encounter_correction_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`encounter_note_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`request_type` text NOT NULL,
	`reason_code` text NOT NULL,
	`reason_text` text NOT NULL,
	`proposed_patient_summary` text NOT NULL,
	`proposed_clinical_content` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`requested_attestation_version` text NOT NULL,
	`authorized_by_user_id` text,
	`authorization_attestation_version` text,
	`authorized_at` integer,
	`status` text DEFAULT 'requested' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`encounter_note_id`) REFERENCES `encounter_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`authorized_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_correction_requests_note_status` ON `encounter_correction_requests` (`encounter_note_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_encounter_correction_requests_status_updated` ON `encounter_correction_requests` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `encounter_follow_up_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`encounter_note_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`task_type` text NOT NULL,
	`title` text NOT NULL,
	`patient_instructions` text NOT NULL,
	`due_window_start` integer NOT NULL,
	`due_window_end` integer NOT NULL,
	`status` text DEFAULT 'recommended' NOT NULL,
	`acknowledged_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`encounter_note_id`) REFERENCES `encounter_notes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_encounter_follow_up_patient_status_due` ON `encounter_follow_up_tasks` (`patient_id`,`status`,`due_window_start`);--> statement-breakpoint
CREATE INDEX `idx_encounter_follow_up_provider_appointment` ON `encounter_follow_up_tasks` (`provider_id`,`appointment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pharmacy_fulfilments` (
	`id` text PRIMARY KEY NOT NULL,
	`prescription_order_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`pharmacy_organization_id` text NOT NULL,
	`refill_request_id` text,
	`method` text NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`clarification_message` text,
	`rejection_reason_code` text,
	`cancelled_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prescription_order_id`) REFERENCES `pharmacy_prescription_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pharmacy_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`refill_request_id`) REFERENCES `pharmacy_refill_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_fulfilments_patient_updated` ON `pharmacy_fulfilments` (`patient_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pharmacy_fulfilments_org_status_updated` ON `pharmacy_fulfilments` (`pharmacy_organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pharmacy_fulfilments_order` ON `pharmacy_fulfilments` (`prescription_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pharmacy_fulfilments_refill_request` ON `pharmacy_fulfilments` (`refill_request_id`);--> statement-breakpoint
CREATE TABLE `pharmacy_prescription_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`medication_label` text NOT NULL,
	`directions` text NOT NULL,
	`quantity_label` text NOT NULL,
	`repeats_authorized` integer DEFAULT 0 NOT NULL,
	`repeats_remaining` integer DEFAULT 0 NOT NULL,
	`valid_until` integer NOT NULL,
	`source` text DEFAULT 'provider_issued' NOT NULL,
	`approval_status` text DEFAULT 'approved' NOT NULL,
	`attestation_version` text NOT NULL,
	`issued_by_user_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_orders_patient_status_updated` ON `pharmacy_prescription_orders` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pharmacy_orders_provider_status_updated` ON `pharmacy_prescription_orders` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pharmacy_orders_appointment` ON `pharmacy_prescription_orders` (`appointment_id`);--> statement-breakpoint
CREATE TABLE `pharmacy_profiles` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`pickup_enabled` integer DEFAULT true NOT NULL,
	`delivery_enabled` integer DEFAULT false NOT NULL,
	`service_area_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_profiles_approval_updated` ON `pharmacy_profiles` (`approval_status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `pharmacy_refill_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`prescription_order_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`request_type` text NOT NULL,
	`patient_note` text NOT NULL,
	`status` text DEFAULT 'pending_provider_review' NOT NULL,
	`provider_decision_reason` text,
	`reviewed_by_user_id` text,
	`reviewed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`prescription_order_id`) REFERENCES `pharmacy_prescription_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_refills_patient_updated` ON `pharmacy_refill_requests` (`patient_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_pharmacy_refills_provider_status_updated` ON `pharmacy_refill_requests` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `pharmacy_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`orders_created` integer NOT NULL,
	`fulfilments_created` integer NOT NULL,
	`refills_approved` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_rehearsals_result_executed` ON `pharmacy_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `pharmacy_workflow_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_pharmacy_events_resource_created` ON `pharmacy_workflow_events` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sample_collection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `sample_collection_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sample_collection_events_request_created` ON `sample_collection_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sample_collection_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`laboratory_organization_id` text NOT NULL,
	`collection_organization_id` text NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`laboratory_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sample_collection_partners_laboratory_collection` ON `sample_collection_partners` (`laboratory_organization_id`,`collection_organization_id`);--> statement-breakpoint
CREATE INDEX `idx_sample_collection_partners_collection_status` ON `sample_collection_partners` (`collection_organization_id`,`approval_status`);--> statement-breakpoint
CREATE TABLE `sample_collection_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`requests_created` integer NOT NULL,
	`assignments_created` integer NOT NULL,
	`location_events_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_sample_collection_rehearsals_result_executed` ON `sample_collection_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `sample_collection_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`laboratory_order_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`laboratory_organization_id` text NOT NULL,
	`assigned_organization_id` text NOT NULL,
	`assigned_collector_id` text,
	`address_line` text NOT NULL,
	`area` text NOT NULL,
	`access_instructions` text DEFAULT '' NOT NULL,
	`accessibility_needs` text DEFAULT '' NOT NULL,
	`requested_window_start` integer NOT NULL,
	`requested_window_end` integer NOT NULL,
	`arrival_window_start` integer,
	`arrival_window_end` integer,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`hold_reason_code` text,
	`unable_reason_code` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`laboratory_order_id`) REFERENCES `laboratory_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`laboratory_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_collector_id`) REFERENCES `sample_collectors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sample_collection_requests_active_order` ON `sample_collection_requests` (`laboratory_order_id`);--> statement-breakpoint
CREATE INDEX `idx_sample_collection_requests_patient_created` ON `sample_collection_requests` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_sample_collection_requests_org_status_updated` ON `sample_collection_requests` (`assigned_organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sample_collection_requests_collector_status` ON `sample_collection_requests` (`assigned_collector_id`,`status`);--> statement-breakpoint
CREATE TABLE `sample_collectors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`display_name` text NOT NULL,
	`role_label` text NOT NULL,
	`credential_reference` text NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`authorization_status` text DEFAULT 'inactive' NOT NULL,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sample_collectors_org_credential` ON `sample_collectors` (`organization_id`,`credential_reference`);--> statement-breakpoint
CREATE INDEX `idx_sample_collectors_org_verification_authorization` ON `sample_collectors` (`organization_id`,`verification_status`,`authorization_status`);--> statement-breakpoint
PRAGMA optimize;

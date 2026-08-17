CREATE TABLE `care_plan_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`patient_user_id` text NOT NULL,
	`boundary_version` text NOT NULL,
	`acknowledged_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_plan_ack_plan_version_user` ON `care_plan_acknowledgements` (`plan_id`,`plan_version`,`patient_user_id`);--> statement-breakpoint
CREATE TABLE `care_plan_events` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`resource_version` integer NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_events_plan_created` ON `care_plan_events` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_plan_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`target_en` text NOT NULL,
	`target_ar` text NOT NULL,
	`accountable_owner_type` text NOT NULL,
	`accountable_owner_label` text NOT NULL,
	`due_date` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_version_id`) REFERENCES `care_plan_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_goals_version_order` ON `care_plan_goals` (`plan_version_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_care_plan_goals_plan_due` ON `care_plan_goals` (`plan_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `care_plan_progress_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`goal_id` text NOT NULL,
	`patient_user_id` text NOT NULL,
	`progress_band` text NOT NULL,
	`patient_note` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`goal_id`) REFERENCES `care_plan_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_progress_plan_created` ON `care_plan_progress_entries` (`plan_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_plan_progress_goal_created` ON `care_plan_progress_entries` (`goal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `care_plan_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`plans_created` integer DEFAULT 0 NOT NULL,
	`clinical_instructions_changed` integer DEFAULT 0 NOT NULL,
	`external_messages_sent` integer DEFAULT 0 NOT NULL,
	`device_actions_triggered` integer DEFAULT 0 NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_rehearsals_result_executed` ON `care_plan_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `care_plan_review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`patient_user_id` text NOT NULL,
	`request_reason` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`provider_response_code` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_review_plan_status` ON `care_plan_review_requests` (`plan_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_plan_review_status_updated` ON `care_plan_review_requests` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `care_plan_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`goal_id` text,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`instructions_en` text NOT NULL,
	`instructions_ar` text NOT NULL,
	`accountable_owner_type` text NOT NULL,
	`accountable_owner_label` text NOT NULL,
	`due_date` text NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_version_id`) REFERENCES `care_plan_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`goal_id`) REFERENCES `care_plan_goals`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_care_plan_tasks_version_order` ON `care_plan_tasks` (`plan_version_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_care_plan_tasks_goal_due` ON `care_plan_tasks` (`goal_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `care_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`previous_version_id` text,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`title_en` text NOT NULL,
	`title_ar` text NOT NULL,
	`patient_instructions_en` text NOT NULL,
	`patient_instructions_ar` text NOT NULL,
	`emergency_guidance_en` text NOT NULL,
	`emergency_guidance_ar` text NOT NULL,
	`change_reason` text NOT NULL,
	`authored_by_user_id` text NOT NULL,
	`authored_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `care_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`authored_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_plan_versions_plan_version` ON `care_plan_versions` (`plan_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_care_plan_versions_plan_authored` ON `care_plan_versions` (`plan_id`,`authored_at`);--> statement-breakpoint
CREATE TABLE `care_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`current_version_id` text NOT NULL,
	`patient_acknowledged_at` integer,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_plans_appointment` ON `care_plans` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_care_plans_patient_status_updated` ON `care_plans` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_care_plans_provider_status_updated` ON `care_plans` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_imaging_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`reason_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `diagnostic_imaging_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_events_order_created` ON `diagnostic_imaging_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_imaging_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`ordering_provider_id` text NOT NULL,
	`imaging_organization_id` text NOT NULL,
	`study_type` text NOT NULL,
	`body_region` text NOT NULL,
	`clinical_indication` text NOT NULL,
	`preparation_instructions` text NOT NULL,
	`priority` text DEFAULT 'routine' NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`provider_attestation_version` text NOT NULL,
	`signed_by_user_id` text NOT NULL,
	`signed_at` integer NOT NULL,
	`partner_clarification` text,
	`rejection_reason_code` text,
	`scheduled_at` integer,
	`completed_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ordering_provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`imaging_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`signed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_provider_appointment` ON `diagnostic_imaging_orders` (`ordering_provider_id`,`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_patient_status_updated` ON `diagnostic_imaging_orders` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_partner_status_updated` ON `diagnostic_imaging_orders` (`imaging_organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_imaging_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`orders_created` integer NOT NULL,
	`reports_created` integer NOT NULL,
	`external_requests_sent` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_rehearsals_result_executed` ON `diagnostic_imaging_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `diagnostic_imaging_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`source` text DEFAULT 'synthetic_demo' NOT NULL,
	`report_status` text DEFAULT 'final' NOT NULL,
	`findings_text` text NOT NULL,
	`impression_text` text NOT NULL,
	`recommendations_text` text NOT NULL,
	`urgent_finding` integer DEFAULT false NOT NULL,
	`partner_protocol_attested` integer DEFAULT false NOT NULL,
	`issued_by_user_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `diagnostic_imaging_orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_diagnostic_imaging_reports_order` ON `diagnostic_imaging_reports` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_diagnostic_imaging_reports_urgent_issued` ON `diagnostic_imaging_reports` (`urgent_finding`,`issued_at`);--> statement-breakpoint
CREATE TABLE `insurance_authorization_events` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text,
	`authorization_request_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`authorization_request_id`) REFERENCES `insurance_authorization_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_insurance_events_request_created` ON `insurance_authorization_events` (`authorization_request_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_events_policy_created` ON `insurance_authorization_events` (`policy_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `insurance_authorization_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`policies_created` integer NOT NULL,
	`requests_created` integer NOT NULL,
	`payer_messages_sent` integer NOT NULL,
	`claims_created` integer NOT NULL,
	`payments_guaranteed` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_insurance_rehearsals_result_executed` ON `insurance_authorization_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `insurance_authorization_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`policy_id` text NOT NULL,
	`appointment_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`payer_organization_id` text NOT NULL,
	`service_code` text NOT NULL,
	`service_label` text NOT NULL,
	`provider_note` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`payer_reason_code` text,
	`payer_message` text,
	`authorization_reference` text,
	`valid_from` integer,
	`valid_until` integer,
	`decided_by_user_id` text,
	`decided_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`policy_id`) REFERENCES `insurance_policies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payer_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_insurance_authorizations_patient_status` ON `insurance_authorization_requests` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_authorizations_provider_status` ON `insurance_authorization_requests` (`provider_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_authorizations_payer_status` ON `insurance_authorization_requests` (`payer_organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_authorizations_appointment` ON `insurance_authorization_requests` (`appointment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `insurance_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`payer_organization_id` text NOT NULL,
	`member_reference` text NOT NULL,
	`member_reference_last4` text NOT NULL,
	`plan_label` text NOT NULL,
	`consent_version` text NOT NULL,
	`consented_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`eligibility_status` text DEFAULT 'not_checked' NOT NULL,
	`eligibility_reason_code` text,
	`eligibility_verified_at` integer,
	`eligibility_verified_by_user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payer_organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`eligibility_verified_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_insurance_policies_patient_status` ON `insurance_policies` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_policies_payer_status` ON `insurance_policies` (`payer_organization_id`,`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;

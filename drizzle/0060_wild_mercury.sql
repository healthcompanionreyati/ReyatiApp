CREATE TABLE `employer_benefit_eligibility` (
	`id` text PRIMARY KEY NOT NULL,
	`programme_id` text NOT NULL,
	`patient_id` text,
	`entry_mode` text NOT NULL,
	`invitation_binding_hash` text,
	`synthetic_reference` text,
	`status` text DEFAULT 'offered' NOT NULL,
	`visibility_status` text DEFAULT 'hidden' NOT NULL,
	`consent_version` text,
	`consented_at` integer,
	`withdrawn_at` integer,
	`benefit_limit_minor` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`programme_id`) REFERENCES `employer_benefit_programmes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employer_benefit_eligibility_programme_invite` ON `employer_benefit_eligibility` (`programme_id`,`invitation_binding_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employer_benefit_eligibility_programme_synthetic` ON `employer_benefit_eligibility` (`programme_id`,`synthetic_reference`);--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_eligibility_patient_status` ON `employer_benefit_eligibility` (`patient_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_eligibility_programme_status` ON `employer_benefit_eligibility` (`programme_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `employer_benefit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`programme_id` text NOT NULL,
	`eligibility_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`programme_id`) REFERENCES `employer_benefit_programmes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`eligibility_id`) REFERENCES `employer_benefit_eligibility`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_events_programme_created` ON `employer_benefit_events` (`programme_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `employer_benefit_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`programme_id` text NOT NULL,
	`eligibility_id` text,
	`entry_type` text NOT NULL,
	`direction` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'QAR' NOT NULL,
	`source_reference` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`external_movement` integer DEFAULT false NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`programme_id`) REFERENCES `employer_benefit_programmes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`eligibility_id`) REFERENCES `employer_benefit_eligibility`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employer_benefit_ledger_programme_idempotency` ON `employer_benefit_ledger_entries` (`programme_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_ledger_programme_created` ON `employer_benefit_ledger_entries` (`programme_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_ledger_eligibility_created` ON `employer_benefit_ledger_entries` (`eligibility_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `employer_benefit_programmes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name_en` text NOT NULL,
	`name_ar` text NOT NULL,
	`description_en` text NOT NULL,
	`description_ar` text NOT NULL,
	`currency` text DEFAULT 'QAR' NOT NULL,
	`member_limit_minor` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`eligibility_mode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_programmes_org_status` ON `employer_benefit_programmes` (`organization_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_programmes_window` ON `employer_benefit_programmes` (`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `employer_benefit_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`programmes_created` integer NOT NULL,
	`roster_entries_created` integer NOT NULL,
	`ledger_entries_created` integer NOT NULL,
	`external_messages_sent` integer NOT NULL,
	`money_movements_created` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_employer_benefit_rehearsals_result_executed` ON `employer_benefit_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `finance_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`decision_id` text NOT NULL,
	`adjustment_type` text NOT NULL,
	`amount_qar` integer NOT NULL,
	`currency` text DEFAULT 'QAR' NOT NULL,
	`reference_only_provider_id` text NOT NULL,
	`execution_status` text DEFAULT 'recorded_not_executed' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `finance_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decision_id`) REFERENCES `finance_case_decisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_finance_adjustments_decision` ON `finance_adjustments` (`decision_id`);--> statement-breakpoint
CREATE INDEX `idx_finance_adjustments_ledger_created` ON `finance_adjustments` (`ledger_entry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `finance_case_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`maker_user_id` text NOT NULL,
	`checker_user_id` text,
	`decision_type` text NOT NULL,
	`reason_code` text NOT NULL,
	`approved_amount_qar` integer,
	`status` text DEFAULT 'pending_checker' NOT NULL,
	`maker_note` text DEFAULT '' NOT NULL,
	`checker_note` text DEFAULT '' NOT NULL,
	`prepared_at` integer NOT NULL,
	`checked_at` integer,
	FOREIGN KEY (`case_id`) REFERENCES `finance_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`maker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_finance_case_decisions_case_prepared` ON `finance_case_decisions` (`case_id`,`prepared_at`);--> statement-breakpoint
CREATE INDEX `idx_finance_case_decisions_status_prepared` ON `finance_case_decisions` (`status`,`prepared_at`);--> statement-breakpoint
CREATE TABLE `finance_case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text,
	`next_status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `finance_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_finance_case_events_case_created` ON `finance_case_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `finance_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`ledger_entry_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`request_type` text NOT NULL,
	`reason_code` text NOT NULL,
	`patient_summary` text NOT NULL,
	`requested_amount_qar` integer,
	`status` text DEFAULT 'submitted' NOT NULL,
	`triage_code` text,
	`resolution_code` text,
	`patient_status_note` text DEFAULT 'Request received for review.' NOT NULL,
	`maker_user_id` text,
	`checker_user_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ledger_entry_id`) REFERENCES `payment_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`maker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_finance_cases_patient_created` ON `finance_cases` (`patient_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_finance_cases_status_updated` ON `finance_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_finance_cases_ledger_status` ON `finance_cases` (`ledger_entry_id`,`status`);--> statement-breakpoint
CREATE TABLE `finance_control_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`cases_created` integer NOT NULL,
	`adjustments_created` integer NOT NULL,
	`provider_calls_made` integer NOT NULL,
	`money_movements_executed` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_finance_control_rehearsals_result_executed` ON `finance_control_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `finance_reconciliation_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`adjustment_id` text,
	`evidence_type` text NOT NULL,
	`reference_only_provider_id` text NOT NULL,
	`evidence_reference` text NOT NULL,
	`evidence_digest` text NOT NULL,
	`recorded_by_user_id` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `finance_cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`adjustment_id`) REFERENCES `finance_adjustments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_finance_reconciliation_evidence_digest` ON `finance_reconciliation_evidence` (`evidence_digest`);--> statement-breakpoint
CREATE INDEX `idx_finance_reconciliation_evidence_case_recorded` ON `finance_reconciliation_evidence` (`case_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `patient_review_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`appellant_user_id` text NOT NULL,
	`reason_code` text NOT NULL,
	`statement` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`resolution_note` text,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `patient_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`appellant_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_review_appeals_status_created` ON `patient_review_appeals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_review_appeals_review_created` ON `patient_review_appeals` (`review_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `patient_review_moderation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason_code` text NOT NULL,
	`note` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`review_version` integer NOT NULL,
	`moderation_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `patient_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_review_moderation_review_created` ON `patient_review_moderation_events` (`review_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_review_moderation_action_created` ON `patient_review_moderation_events` (`action`,`created_at`);--> statement-breakpoint
CREATE TABLE `patient_review_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`suite_version` text NOT NULL,
	`scenario_count` integer NOT NULL,
	`passed_scenarios` integer NOT NULL,
	`failed_scenarios` integer NOT NULL,
	`reviews_created` integer NOT NULL,
	`moderation_decisions_created` integer NOT NULL,
	`notifications_sent` integer NOT NULL,
	`public_records_changed` integer NOT NULL,
	`result` text NOT NULL,
	`data_mode` text DEFAULT 'synthetic_only' NOT NULL,
	`executed_by_user_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	FOREIGN KEY (`executed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_patient_review_rehearsals_result_executed` ON `patient_review_rehearsals` (`result`,`executed_at`);--> statement-breakpoint
CREATE TABLE `patient_review_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`version` integer NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`ratings_json` text NOT NULL,
	`review_text` text NOT NULL,
	`locale` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `patient_reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_patient_review_revisions_review_version` ON `patient_review_revisions` (`review_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_patient_review_revisions_review_created` ON `patient_review_revisions` (`review_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `patient_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`patient_user_id` text NOT NULL,
	`overall_rating` integer NOT NULL,
	`communication_rating` integer NOT NULL,
	`timeliness_rating` integer NOT NULL,
	`clarity_rating` integer NOT NULL,
	`would_recommend` integer NOT NULL,
	`review_text` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`current_reason_code` text,
	`content_version` integer DEFAULT 1 NOT NULL,
	`moderation_version` integer DEFAULT 1 NOT NULL,
	`submitted_at` integer NOT NULL,
	`published_at` integer,
	`withdrawn_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`provider_id`) REFERENCES `provider_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`patient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_patient_reviews_one_per_appointment` ON `patient_reviews` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `idx_patient_reviews_patient_created` ON `patient_reviews` (`patient_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_reviews_provider_status_published` ON `patient_reviews` (`provider_id`,`status`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_patient_reviews_status_updated` ON `patient_reviews` (`status`,`updated_at`);--> statement-breakpoint
PRAGMA optimize;

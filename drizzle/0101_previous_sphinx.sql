ALTER TABLE `payment_credit_notes` ADD `document_id` text REFERENCES document_records(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_credit_note_document` ON `payment_credit_notes` (`document_id`);--> statement-breakpoint
ALTER TABLE `payment_receipts` ADD `document_id` text REFERENCES document_records(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_receipt_document` ON `payment_receipts` (`document_id`);
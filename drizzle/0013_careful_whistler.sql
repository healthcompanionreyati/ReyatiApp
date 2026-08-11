CREATE INDEX `idx_payment_ledger_status_updated` ON `payment_ledger_entries` (`status`,`status_updated_at`);--> statement-breakpoint
PRAGMA optimize;

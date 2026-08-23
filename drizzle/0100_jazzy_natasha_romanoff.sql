ALTER TABLE `outbound_messages` ADD `resource_type` text;--> statement-breakpoint
ALTER TABLE `outbound_messages` ADD `resource_id` text;--> statement-breakpoint
CREATE INDEX `idx_outbound_messages_resource_created` ON `outbound_messages` (`resource_type`,`resource_id`,`created_at`);
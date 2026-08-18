DROP INDEX `radcheck_username_attribute_idx` ON `radcheck`;--> statement-breakpoint
DROP INDEX `radreply_username_attribute_idx` ON `radreply`;--> statement-breakpoint
ALTER TABLE `radius_cards` MODIFY COLUMN `renewalAnchorSessionTime` int;--> statement-breakpoint
ALTER TABLE `online_sessions` ADD `acctUniqueId` varchar(64);--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `lastUsedAt` timestamp;--> statement-breakpoint
ALTER TABLE `radcheck` ADD CONSTRAINT `username_attribute_unique` UNIQUE(`username`,`attribute`);--> statement-breakpoint
ALTER TABLE `radreply` ADD CONSTRAINT `username_attribute_unique` UNIQUE(`username`,`attribute`);--> statement-breakpoint
CREATE INDEX `online_sessions_acct_unique_id_idx` ON `online_sessions` (`acctUniqueId`);
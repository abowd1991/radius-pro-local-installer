CREATE INDEX `radacct_username_stoptime_idx` ON `radacct` (`username`,`acctstoptime`);--> statement-breakpoint
CREATE INDEX `radacct_stoptime_idx` ON `radacct` (`acctstoptime`);--> statement-breakpoint
CREATE INDEX `radacct_username_idx` ON `radacct` (`username`);--> statement-breakpoint
CREATE INDEX `radacct_starttime_idx` ON `radacct` (`acctstarttime`);--> statement-breakpoint
CREATE INDEX `radacct_uniqueid_idx` ON `radacct` (`acctuniqueid`);--> statement-breakpoint
CREATE INDEX `radcheck_username_attribute_idx` ON `radcheck` (`username`,`attribute`);--> statement-breakpoint
CREATE INDEX `radcheck_username_idx` ON `radcheck` (`username`);--> statement-breakpoint
CREATE INDEX `radius_cards_username_idx` ON `radius_cards` (`username`);--> statement-breakpoint
CREATE INDEX `radius_cards_status_window_idx` ON `radius_cards` (`status`,`windowEndTime`);--> statement-breakpoint
CREATE INDEX `radius_cards_created_by_idx` ON `radius_cards` (`createdBy`);--> statement-breakpoint
CREATE INDEX `radius_cards_batch_id_idx` ON `radius_cards` (`batchId`);--> statement-breakpoint
CREATE INDEX `radius_cards_expires_at_idx` ON `radius_cards` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `radreply_username_attribute_idx` ON `radreply` (`username`,`attribute`);--> statement-breakpoint
CREATE INDEX `radreply_username_idx` ON `radreply` (`username`);
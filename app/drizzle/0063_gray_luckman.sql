DROP INDEX `radacct_stoptime_idx` ON `radacct`;--> statement-breakpoint
CREATE INDEX `idx_radacct_acctstoptime` ON `radacct` (`acctstoptime`);--> statement-breakpoint
CREATE INDEX `idx_radacct_username_starttime` ON `radacct` (`username`,`acctstarttime`);
CREATE INDEX `idx_radacct_stoptime_user` ON `radacct` (`acctstoptime`,`username`);--> statement-breakpoint
CREATE INDEX `idx_radacct_acctsessionid` ON `radacct` (`acctsessionid`);
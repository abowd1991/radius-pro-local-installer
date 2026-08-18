CREATE INDEX `radacct_nasipaddress_idx` ON `radacct` (`nasipaddress`);--> statement-breakpoint
CREATE INDEX `radacct_stoptime_updatetime_idx` ON `radacct` (`acctstoptime`,`acctupdatetime`);
DROP INDEX `os_username_idx` ON `online_sessions`;--> statement-breakpoint
DROP INDEX `os_acct_session_id_idx` ON `online_sessions`;--> statement-breakpoint
DROP INDEX `os_framed_ip_idx` ON `online_sessions`;--> statement-breakpoint
DROP INDEX `os_last_interim_at_idx` ON `online_sessions`;--> statement-breakpoint
CREATE INDEX `online_sessions_username_idx` ON `online_sessions` (`username`);--> statement-breakpoint
CREATE INDEX `online_sessions_acct_session_id_idx` ON `online_sessions` (`acctSessionId`);--> statement-breakpoint
CREATE INDEX `online_sessions_framed_ip_idx` ON `online_sessions` (`framedIpAddress`);--> statement-breakpoint
CREATE INDEX `online_sessions_last_interim_at_idx` ON `online_sessions` (`last_interim_at`);
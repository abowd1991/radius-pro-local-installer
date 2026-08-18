CREATE TABLE `billing_run_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runAt` timestamp NOT NULL DEFAULT (now()),
	`triggeredBy` enum('cron','manual') NOT NULL DEFAULT 'cron',
	`usersChecked` int NOT NULL DEFAULT 0,
	`usersProcessed` int NOT NULL DEFAULT 0,
	`usersSkipped` int NOT NULL DEFAULT 0,
	`usersFailed` int NOT NULL DEFAULT 0,
	`totalDeducted` decimal(10,2) NOT NULL DEFAULT '0.00',
	`lowBalanceNotifications` int NOT NULL DEFAULT 0,
	`durationMs` int NOT NULL DEFAULT 0,
	`status` enum('success','partial','failed') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	CONSTRAINT `billing_run_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `billing_run_logs_run_at_idx` ON `billing_run_logs` (`runAt`);--> statement-breakpoint
CREATE INDEX `billing_run_logs_status_idx` ON `billing_run_logs` (`status`);
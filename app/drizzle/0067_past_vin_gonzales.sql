CREATE TABLE `cron_job_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`job_id` varchar(100) NOT NULL,
	`success` boolean NOT NULL,
	`message` text,
	`duration_ms` int,
	`run_at` bigint NOT NULL,
	`triggered_by` varchar(20) NOT NULL DEFAULT 'auto',
	CONSTRAINT `cron_job_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cron_job_settings` (
	`job_id` varchar(100) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`consecutive_failures` int NOT NULL DEFAULT 0,
	`last_notified_at` bigint,
	`updated_at` bigint NOT NULL,
	CONSTRAINT `cron_job_settings_job_id` PRIMARY KEY(`job_id`)
);
--> statement-breakpoint
CREATE INDEX `cron_job_logs_job_id_idx` ON `cron_job_logs` (`job_id`);--> statement-breakpoint
CREATE INDEX `cron_job_logs_run_at_idx` ON `cron_job_logs` (`run_at`);
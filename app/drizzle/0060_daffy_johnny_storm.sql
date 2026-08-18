ALTER TABLE `notification_channels` ADD `customSmsMessages` text;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `reminderHoursManualCard` int DEFAULT 24 NOT NULL;
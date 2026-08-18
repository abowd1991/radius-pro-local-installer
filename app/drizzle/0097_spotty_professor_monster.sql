ALTER TABLE `nas` ADD `timezone` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `timezone` varchar(64) DEFAULT 'Asia/Gaza' NOT NULL;
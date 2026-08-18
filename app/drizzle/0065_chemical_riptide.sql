CREATE TABLE `system_updates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(20) NOT NULL,
	`status` enum('pending','running','success','failed') NOT NULL DEFAULT 'pending',
	`triggeredBy` int,
	`triggeredByName` varchar(255),
	`log` text,
	`errorMessage` text,
	`duration` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `system_updates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `system_updates_created_at_idx` ON `system_updates` (`createdAt`);
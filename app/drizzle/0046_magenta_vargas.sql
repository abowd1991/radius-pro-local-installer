CREATE TABLE `network_monitor_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`autoPingEnabled` boolean NOT NULL DEFAULT false,
	`pingIntervalMinutes` int NOT NULL DEFAULT 5,
	`lastAutoPingAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_monitor_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `network_monitor_settings_ownerId_unique` UNIQUE(`ownerId`)
);

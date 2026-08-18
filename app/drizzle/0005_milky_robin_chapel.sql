ALTER TABLE `nas` ADD `provisioningStatus` enum('pending','provisioning','ready','error') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `nas` ADD `allocatedIp` varchar(45);--> statement-breakpoint
ALTER TABLE `nas` ADD `lastTempIp` varchar(45);--> statement-breakpoint
ALTER TABLE `nas` ADD `lastMac` varchar(17);--> statement-breakpoint
ALTER TABLE `nas` ADD `provisionedAt` timestamp;--> statement-breakpoint
ALTER TABLE `nas` ADD `provisioningError` text;
CREATE TABLE `store_phone_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`phone` varchar(20) NOT NULL,
	`pinHash` varchar(255) NOT NULL,
	`otpCode` varchar(6),
	`otpExpiresAt` timestamp,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`adminReset` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_phone_pins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `macAddress` varchar(17);--> statement-breakpoint
CREATE INDEX `store_phone_pins_store_phone_idx` ON `store_phone_pins` (`storeId`,`phone`);
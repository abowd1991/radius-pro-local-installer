CREATE TABLE `sms_balance_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`adminId` int NOT NULL,
	`adminName` varchar(255),
	`action` enum('topup','set','deduct') NOT NULL DEFAULT 'topup',
	`amount` int NOT NULL,
	`balanceBefore` int NOT NULL DEFAULT 0,
	`balanceAfter` int NOT NULL DEFAULT 0,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_balance_log_id` PRIMARY KEY(`id`)
);

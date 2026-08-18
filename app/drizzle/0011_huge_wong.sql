CREATE TABLE `wallet_ledger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('credit','debit') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`balanceBefore` decimal(12,2) NOT NULL,
	`balanceAfter` decimal(12,2) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`reasonAr` varchar(255),
	`entityType` varchar(50),
	`entityId` int,
	`actorId` int,
	`actorRole` varchar(50),
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallet_ledger_id` PRIMARY KEY(`id`)
);

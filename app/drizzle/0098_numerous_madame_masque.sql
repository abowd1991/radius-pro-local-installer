CREATE TABLE `card_lifecycle_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lifecycleId` varchar(36) NOT NULL,
	`cardId` int,
	`username` varchar(64) NOT NULL,
	`acctSessionId` varchar(64) NOT NULL,
	`acctUniqueId` varchar(64),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	CONSTRAINT `card_lifecycle_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `card_lifecycle_sessions_acct_unique_idx` UNIQUE(`acctUniqueId`)
);
--> statement-breakpoint
CREATE TABLE `card_lifecycles` (
	`lifecycleId` varchar(36) NOT NULL,
	`cardId` int,
	`username` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`openedAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	`closeReason` varchar(64),
	CONSTRAINT `card_lifecycles_lifecycleId` PRIMARY KEY(`lifecycleId`)
);
--> statement-breakpoint
ALTER TABLE `online_sessions` ADD `lifecycleId` varchar(36);--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `lifecycleId` varchar(36);--> statement-breakpoint
UPDATE `radius_cards` SET `lifecycleId` = UUID() WHERE `lifecycleId` IS NULL;--> statement-breakpoint
ALTER TABLE `radius_cards` MODIFY COLUMN `lifecycleId` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD CONSTRAINT `radius_cards_lifecycleId_unique` UNIQUE(`lifecycleId`);--> statement-breakpoint
CREATE INDEX `card_lifecycle_sessions_acct_session_idx` ON `card_lifecycle_sessions` (`acctSessionId`);--> statement-breakpoint
CREATE INDEX `card_lifecycle_sessions_lifecycle_idx` ON `card_lifecycle_sessions` (`lifecycleId`);--> statement-breakpoint
CREATE INDEX `card_lifecycles_username_owner_idx` ON `card_lifecycles` (`username`,`ownerId`);--> statement-breakpoint
CREATE INDEX `card_lifecycles_card_id_idx` ON `card_lifecycles` (`cardId`);--> statement-breakpoint
CREATE INDEX `online_sessions_lifecycle_id_idx` ON `online_sessions` (`lifecycleId`);--> statement-breakpoint
CREATE INDEX `radius_cards_lifecycle_id_idx` ON `radius_cards` (`lifecycleId`);--> statement-breakpoint
INSERT INTO `card_lifecycles` (`lifecycleId`, `cardId`, `username`, `ownerId`, `openedAt`)
SELECT `lifecycleId`, `id`, `username`, `createdBy`, `createdAt` FROM `radius_cards`;--> statement-breakpoint
UPDATE `online_sessions` AS os
INNER JOIN `radius_cards` AS rc ON rc.`id` = os.`cardId`
SET os.`lifecycleId` = rc.`lifecycleId`
WHERE os.`lifecycleId` IS NULL;

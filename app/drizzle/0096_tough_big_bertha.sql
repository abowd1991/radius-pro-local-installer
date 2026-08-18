CREATE TABLE `card_sales` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`cardId` int NOT NULL,
	`ownerId` int NOT NULL,
	`planId` int NOT NULL,
	`salePrice` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`soldAt` timestamp NOT NULL DEFAULT (now()),
	`saleNasId` int,
	`source` enum('store','manual','legacy_import') NOT NULL DEFAULT 'manual',
	`referenceType` varchar(50),
	`referenceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `card_sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `card_sales_cardId_unique` UNIQUE(`cardId`)
);
--> statement-breakpoint
CREATE INDEX `card_sales_owner_sold_at_idx` ON `card_sales` (`ownerId`,`soldAt`);--> statement-breakpoint
CREATE INDEX `card_sales_plan_sold_at_idx` ON `card_sales` (`planId`,`soldAt`);--> statement-breakpoint
CREATE INDEX `card_sales_nas_sold_at_idx` ON `card_sales` (`saleNasId`,`soldAt`);
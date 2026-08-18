CREATE TABLE `store_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`productId` int NOT NULL,
	`customerName` varchar(120) NOT NULL,
	`customerPhone` varchar(30) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`status` enum('pending','confirmed','delivered','cancelled') NOT NULL DEFAULT 'pending',
	`cardId` int,
	`cardUsername` varchar(100),
	`cardPassword` varchar(100),
	`receiptUrl` varchar(512),
	`notes` text,
	`smsSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`planId` int,
	`batchId` varchar(50),
	`stockThreshold` int NOT NULL DEFAULT 5,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `store_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`slug` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`logoUrl` varchar(512),
	`bannerUrl` varchar(512),
	`paymentPhone` varchar(30),
	`paymentInstructions` text,
	`whatsappPhone` varchar(30),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `store_orders_store_id_idx` ON `store_orders` (`storeId`);--> statement-breakpoint
CREATE INDEX `store_orders_status_idx` ON `store_orders` (`status`);--> statement-breakpoint
CREATE INDEX `store_orders_store_id_status_idx` ON `store_orders` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `store_orders_created_at_idx` ON `store_orders` (`createdAt`);--> statement-breakpoint
CREATE INDEX `store_products_store_id_idx` ON `store_products` (`storeId`);--> statement-breakpoint
CREATE INDEX `store_products_store_id_active_idx` ON `store_products` (`storeId`,`active`);--> statement-breakpoint
CREATE INDEX `stores_owner_id_idx` ON `stores` (`ownerId`);--> statement-breakpoint
CREATE INDEX `stores_slug_idx` ON `stores` (`slug`);
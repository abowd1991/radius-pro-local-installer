ALTER TABLE `store_orders` ADD `quantity` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `cardIds` text;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `cardsData` text;
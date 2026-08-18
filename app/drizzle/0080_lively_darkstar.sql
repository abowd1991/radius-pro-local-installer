ALTER TABLE `store_orders` ADD `orderToken` varchar(64);--> statement-breakpoint
ALTER TABLE `store_orders` ADD CONSTRAINT `store_orders_orderToken_unique` UNIQUE(`orderToken`);--> statement-breakpoint
CREATE INDEX `store_orders_token_idx` ON `store_orders` (`orderToken`);--> statement-breakpoint
CREATE INDEX `store_orders_phone_idx` ON `store_orders` (`customerPhone`);
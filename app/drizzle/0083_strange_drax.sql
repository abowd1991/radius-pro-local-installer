ALTER TABLE `store_orders` MODIFY COLUMN `status` enum('pending','confirmed','delivered','cancelled','partial') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `store_orders` ADD `deliveredCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `store_orders` ADD `remainingCardIds` text;
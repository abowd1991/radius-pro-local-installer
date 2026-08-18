ALTER TABLE `radius_cards` MODIFY COLUMN `status` enum('unused','reserved','active','used','expired','suspended','cancelled') NOT NULL DEFAULT 'unused';--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `reservedOrderId` int;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `reservedAt` timestamp;
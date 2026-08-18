ALTER TABLE `radius_cards` MODIFY COLUMN `password` varchar(64);--> statement-breakpoint
ALTER TABLE `nas` ADD `mikrotikwinboxport` int DEFAULT 8291;--> statement-breakpoint
ALTER TABLE `nas` DROP COLUMN `mikrotikWinboxPort`;
ALTER TABLE `nas` MODIFY COLUMN `nasname` varchar(128) NULL;
--> statement-breakpoint
ALTER TABLE `nas` ADD `mikrotikwinboxport` int DEFAULT 8291;

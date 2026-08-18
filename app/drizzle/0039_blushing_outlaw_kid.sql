ALTER TABLE `check_tokens` ADD `slug` varchar(64);--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `networkName` varchar(128);--> statement-breakpoint
ALTER TABLE `check_tokens` ADD CONSTRAINT `check_tokens_slug_unique` UNIQUE(`slug`);
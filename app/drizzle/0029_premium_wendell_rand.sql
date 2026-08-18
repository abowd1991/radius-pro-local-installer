ALTER TABLE `radius_cards` ADD `currency` varchar(5) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `currencySymbol` varchar(5) DEFAULT '$' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `currency` varchar(5) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `currencySymbol` varchar(5) DEFAULT '$' NOT NULL;
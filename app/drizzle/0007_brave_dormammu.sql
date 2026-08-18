ALTER TABLE `radius_cards` ADD `usageBudgetSeconds` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `windowSeconds` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `firstUseAt` timestamp;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `windowEndTime` timestamp;
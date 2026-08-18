ALTER TABLE `wallets` ADD `creditBalance` decimal(12,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallets` ADD `maxCreditLimit` decimal(12,2) DEFAULT '2.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallets` ADD `creditActivatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `accountStatus`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `trialStartDate`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `trialEndDate`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `subscriptionPlanId`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `subscriptionStartDate`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `subscriptionEndDate`;
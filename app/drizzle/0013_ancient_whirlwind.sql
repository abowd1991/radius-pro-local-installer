ALTER TABLE `users` ADD `lastDailyBillingDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `dailyBillingEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lowBalanceNotifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `lastBillingAt`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `nextBillingAt`;
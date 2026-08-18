ALTER TABLE `users` ADD `billingStartAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `lastBillingAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `nextBillingAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `billingStatus` enum('active','past_due','suspended') DEFAULT 'active' NOT NULL;
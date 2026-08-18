ALTER TABLE `notification_preferences` ADD `ownerManualCardExpiring` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `radius_cards` ADD `expiryReminderSentAt` timestamp;
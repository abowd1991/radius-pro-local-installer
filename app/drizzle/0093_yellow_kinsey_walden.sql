ALTER TABLE `notification_channels` ADD `smsProviderType` varchar(20) DEFAULT 'tweetsms';--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `customSmsApiUrl` text;--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `customSmsBalanceUrl` text;
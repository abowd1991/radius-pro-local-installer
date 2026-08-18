CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`actorRole` varchar(50) NOT NULL,
	`actorName` varchar(255),
	`action` enum('user_create','user_update','user_delete','user_disable','user_enable','role_change','password_reset','password_change','email_change','subscription_create','subscription_update','subscription_cancel','wallet_credit','wallet_debit','nas_create','nas_update','nas_delete','card_create','card_delete','plan_create','plan_update','plan_delete','login','logout','login_failed') NOT NULL,
	`targetType` varchar(50),
	`targetId` int,
	`targetName` varchar(255),
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','super_admin','client_admin','reseller','client','support') NOT NULL DEFAULT 'client';--> statement-breakpoint
ALTER TABLE `users` ADD `ownerId` int;
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userRole` varchar(50) NOT NULL,
	`action` varchar(100) NOT NULL,
	`targetType` varchar(50) NOT NULL,
	`targetId` varchar(100),
	`targetName` varchar(255),
	`nasId` int,
	`nasIp` varchar(45),
	`details` json,
	`result` enum('success','failure','partial') NOT NULL,
	`errorMessage` text,
	`ipAddress` varchar(45),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `internal_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('card_expired','card_expiring','nas_disconnected','nas_reconnected','low_balance','new_subscription','subscription_expired','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `internal_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriber_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriberId` int NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`planId` int NOT NULL,
	`planName` varchar(100) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`paymentMethod` enum('cash','wallet','card','bank_transfer','online') NOT NULL DEFAULT 'cash',
	`status` enum('active','expired','cancelled','refunded') NOT NULL DEFAULT 'active',
	`processedBy` int NOT NULL,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriber_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`createdBy` int NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`email` varchar(320),
	`address` text,
	`nationalId` varchar(50),
	`notes` text,
	`planId` int NOT NULL,
	`nasId` int,
	`ipAssignmentType` enum('dynamic','static') NOT NULL DEFAULT 'dynamic',
	`staticIp` varchar(45),
	`simultaneousUse` int DEFAULT 1,
	`status` enum('active','suspended','expired','pending') NOT NULL DEFAULT 'pending',
	`subscriptionStartDate` timestamp,
	`subscriptionEndDate` timestamp,
	`macAddress` varchar(17),
	`macBindingEnabled` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastLoginAt` timestamp,
	CONSTRAINT `subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscribers_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `tenant_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL,
	`status` enum('active','expired','suspended','cancelled') NOT NULL DEFAULT 'active',
	`pricePerMonth` decimal(10,2) NOT NULL DEFAULT '10.00',
	`startDate` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`lastRenewalDate` timestamp,
	`renewedBy` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_subscriptions_tenantId_unique` UNIQUE(`tenantId`)
);
--> statement-breakpoint
CREATE TABLE `vpn_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nasId` int NOT NULL,
	`connectionType` enum('public_ip','vpn_sstp','vpn_l2tp') NOT NULL,
	`status` enum('connected','disconnected','connecting','error') NOT NULL DEFAULT 'disconnected',
	`localVpnIp` varchar(45),
	`remoteIp` varchar(45),
	`serverIp` varchar(45),
	`uptime` int DEFAULT 0,
	`lastConnectedAt` timestamp,
	`lastDisconnectedAt` timestamp,
	`disconnectCount` int DEFAULT 0,
	`lastError` text,
	`lastErrorAt` timestamp,
	`bytesIn` bigint DEFAULT 0,
	`bytesOut` bigint DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vpn_connections_id` PRIMARY KEY(`id`),
	CONSTRAINT `vpn_connections_nasId_unique` UNIQUE(`nasId`)
);
--> statement-breakpoint
CREATE TABLE `vpn_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nasId` int NOT NULL,
	`vpnConnectionId` int,
	`eventType` enum('connected','disconnected','connection_failed','reconnecting','auth_failed','timeout','manual_disconnect','manual_restart','error','radius_error') NOT NULL,
	`message` text,
	`details` json,
	`localIp` varchar(45),
	`remoteIp` varchar(45),
	`errorCode` varchar(50),
	`errorMessage` text,
	`triggeredBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vpn_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `card_templates` MODIFY COLUMN `usernameY` int DEFAULT 40;--> statement-breakpoint
ALTER TABLE `card_templates` MODIFY COLUMN `passwordY` int DEFAULT 60;--> statement-breakpoint
ALTER TABLE `card_templates` MODIFY COLUMN `qrCodeX` int DEFAULT 50;--> statement-breakpoint
ALTER TABLE `card_templates` MODIFY COLUMN `qrCodeSize` int DEFAULT 50;--> statement-breakpoint
ALTER TABLE `nas` MODIFY COLUMN `connectionType` enum('public_ip','vpn_sstp','vpn_l2tp') DEFAULT 'public_ip';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('super_admin','reseller','client','support') NOT NULL DEFAULT 'client';--> statement-breakpoint
ALTER TABLE `card_batches` ADD `enabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `simultaneousUse` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `cardTimeValue` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `cardTimeUnit` enum('hours','days') DEFAULT 'hours';--> statement-breakpoint
ALTER TABLE `card_batches` ADD `internetTimeValue` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `internetTimeUnit` enum('hours','days') DEFAULT 'hours';--> statement-breakpoint
ALTER TABLE `card_batches` ADD `timeFromActivation` boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `hotspotPort` varchar(100);--> statement-breakpoint
ALTER TABLE `card_batches` ADD `macBinding` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `prefix` varchar(20);--> statement-breakpoint
ALTER TABLE `card_batches` ADD `usernameLength` int DEFAULT 6;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `passwordLength` int DEFAULT 4;--> statement-breakpoint
ALTER TABLE `card_batches` ADD `cardPrice` decimal(10,2);--> statement-breakpoint
ALTER TABLE `card_batches` ADD `updatedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `imageKey` text;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `usernameFontSize` int DEFAULT 14;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `usernameFontFamily` varchar(50) DEFAULT 'Arial';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `usernameFontColor` varchar(9) DEFAULT '#000000';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `usernameAlign` enum('left','center','right') DEFAULT 'center';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `passwordFontSize` int DEFAULT 14;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `passwordFontFamily` varchar(50) DEFAULT 'Arial';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `passwordFontColor` varchar(9) DEFAULT '#000000';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `passwordAlign` enum('left','center','right') DEFAULT 'center';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `qrCodeEnabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `qrCodeDomain` varchar(255);--> statement-breakpoint
ALTER TABLE `card_templates` ADD `cardsPerPage` int DEFAULT 8;--> statement-breakpoint
ALTER TABLE `card_templates` ADD `marginTop` decimal(4,2) DEFAULT '1.8';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `marginHorizontal` decimal(4,2) DEFAULT '1.8';--> statement-breakpoint
ALTER TABLE `card_templates` ADD `columnsPerPage` int DEFAULT 5;--> statement-breakpoint
ALTER TABLE `nas` ADD `vpnUsername` varchar(64);--> statement-breakpoint
ALTER TABLE `nas` ADD `vpnPassword` varchar(128);--> statement-breakpoint
ALTER TABLE `nas` ADD `vpnTunnelIp` varchar(45);--> statement-breakpoint
ALTER TABLE `nas` ADD `ownerId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `nas` ADD `apiEnabled` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `plans` ADD `ownerId` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerified` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerificationCode` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerificationExpires` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetCode` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordResetExpires` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trialExpirationNotified` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `card_templates` DROP COLUMN `fontSize`;--> statement-breakpoint
ALTER TABLE `card_templates` DROP COLUMN `fontColor`;
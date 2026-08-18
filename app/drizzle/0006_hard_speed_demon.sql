CREATE TABLE `sms_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(20) NOT NULL,
	`userId` int,
	`message` text NOT NULL,
	`templateId` int,
	`status` enum('pending','sent','delivered','failed') NOT NULL DEFAULT 'pending',
	`smsId` varchar(100),
	`errorCode` varchar(20),
	`errorMessage` text,
	`type` enum('manual','bulk','automatic') NOT NULL DEFAULT 'manual',
	`triggeredBy` varchar(50),
	`sentBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `sms_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_notification_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(20) NOT NULL,
	`notificationType` varchar(50) NOT NULL,
	`referenceId` int,
	`referenceType` varchar(50),
	`smsLogId` int,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_notification_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100),
	`content` text NOT NULL,
	`contentAr` text,
	`type` enum('subscription_expiry','welcome','payment_reminder','custom') NOT NULL DEFAULT 'custom',
	`isActive` boolean NOT NULL DEFAULT true,
	`isSystem` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sms_templates_id` PRIMARY KEY(`id`)
);

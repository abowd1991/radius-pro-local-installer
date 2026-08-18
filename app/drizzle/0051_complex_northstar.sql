CREATE TABLE `sms_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(30) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sms_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sms_send_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`contactId` int,
	`contactName` varchar(100),
	`contactPhone` varchar(30) NOT NULL,
	`batchId` varchar(50) NOT NULL,
	`cardCount` int NOT NULL,
	`smsCount` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'sent',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_send_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `notification_channels` ADD `smsMonthlyLimit` int DEFAULT 0 NOT NULL;
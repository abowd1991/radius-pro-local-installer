CREATE TABLE `broadcast_recipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`broadcastId` int NOT NULL,
	`recipientId` int NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcast_recipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('info','warning','error','success','update') NOT NULL DEFAULT 'info',
	`targetType` enum('all','specific') NOT NULL DEFAULT 'all',
	`recipientCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `broadcasts_id` PRIMARY KEY(`id`)
);

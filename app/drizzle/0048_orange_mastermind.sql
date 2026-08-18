CREATE TABLE `notification_channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`channel` varchar(20) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`telegramBotToken` varchar(255),
	`telegramChatId` varchar(100),
	`whatsappApiUrl` varchar(255),
	`whatsappApiToken` varchar(255),
	`whatsappInstanceId` varchar(100),
	`whatsappPhone` varchar(50),
	`smsApiKey` varchar(255),
	`smsSender` varchar(50),
	`smsAdminEnabled` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_channels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`channel` varchar(20) NOT NULL,
	`ownerRouterDown` boolean NOT NULL DEFAULT false,
	`ownerNewSubscription` boolean NOT NULL DEFAULT false,
	`ownerCardActivated` boolean NOT NULL DEFAULT false,
	`ownerSubscriptionExpiring` boolean NOT NULL DEFAULT false,
	`ownerNewPayment` boolean NOT NULL DEFAULT false,
	`ownerSupportTicket` boolean NOT NULL DEFAULT false,
	`subscriberNewSubscription` boolean NOT NULL DEFAULT false,
	`subscriberCardActivated` boolean NOT NULL DEFAULT false,
	`subscriberSubscriptionExpiring` boolean NOT NULL DEFAULT false,
	`subscriberNewPayment` boolean NOT NULL DEFAULT false,
	`subscriberSupportTicket` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriber_notification_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ownerId` int NOT NULL,
	`channel` varchar(20) NOT NULL,
	`chatId` varchar(100),
	`phone` varchar(50),
	`verified` boolean NOT NULL DEFAULT false,
	`verifyCode` varchar(10),
	`verifyExpiry` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriber_notification_links_id` PRIMARY KEY(`id`)
);

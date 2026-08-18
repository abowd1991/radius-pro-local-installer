CREATE TABLE `feedback_analytics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`event` enum('viewed','snoozed','dismissed','submitted') NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `feedback_analytics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedback_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`type` enum('rating','nps','survey','vote') NOT NULL DEFAULT 'rating',
	`isActive` boolean NOT NULL DEFAULT false,
	`priority` int NOT NULL DEFAULT 0,
	`startAt` bigint NOT NULL,
	`endAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `feedback_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedback_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`icon` varchar(50),
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `feedback_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feedback_response_categories` (
	`responseId` int NOT NULL,
	`categoryId` int NOT NULL,
	CONSTRAINT `frc_unique_pair` UNIQUE(`responseId`,`categoryId`)
);
--> statement-breakpoint
CREATE TABLE `feedback_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int NOT NULL,
	`ownerId` int,
	`role` varchar(30),
	`rating` smallint,
	`comment` text,
	`appVersion` varchar(20),
	`device` varchar(100),
	`browser` varchar(100),
	`dismissed` boolean NOT NULL DEFAULT false,
	`dismissedAt` bigint,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `feedback_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `fa_campaign_idx` ON `feedback_analytics` (`campaignId`,`event`);--> statement-breakpoint
CREATE INDEX `fa_user_idx` ON `feedback_analytics` (`userId`);--> statement-breakpoint
CREATE INDEX `fc_active_idx` ON `feedback_campaigns` (`isActive`,`priority`);--> statement-breakpoint
CREATE INDEX `fc_version_idx` ON `feedback_campaigns` (`version`);--> statement-breakpoint
CREATE INDEX `fcat_campaign_idx` ON `feedback_categories` (`campaignId`);--> statement-breakpoint
CREATE INDEX `frc_response_idx` ON `feedback_response_categories` (`responseId`);--> statement-breakpoint
CREATE INDEX `frc_category_idx` ON `feedback_response_categories` (`categoryId`);--> statement-breakpoint
CREATE INDEX `fr_campaign_user_idx` ON `feedback_responses` (`campaignId`,`userId`);--> statement-breakpoint
CREATE INDEX `fr_owner_idx` ON `feedback_responses` (`ownerId`);--> statement-breakpoint
CREATE INDEX `fr_created_at_idx` ON `feedback_responses` (`createdAt`);
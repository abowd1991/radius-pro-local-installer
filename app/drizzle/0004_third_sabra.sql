CREATE TABLE `saas_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100),
	`description` text,
	`descriptionAr` text,
	`priceMonthly` decimal(10,2) NOT NULL,
	`priceYearly` decimal(10,2),
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`maxNasDevices` int NOT NULL DEFAULT 1,
	`maxCards` int NOT NULL DEFAULT 100,
	`maxSubscribers` int DEFAULT 50,
	`featureMikrotikApi` boolean DEFAULT false,
	`featureCoaDisconnect` boolean DEFAULT true,
	`featureStaticVpnIp` boolean DEFAULT false,
	`featureAdvancedReports` boolean DEFAULT false,
	`featureCustomBranding` boolean DEFAULT false,
	`featurePrioritySupport` boolean DEFAULT false,
	`displayOrder` int DEFAULT 0,
	`isPopular` boolean DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saas_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saas_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` int NOT NULL,
	`planName` varchar(100) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`billingCycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('active','expired','cancelled','suspended') NOT NULL DEFAULT 'active',
	`paymentMethod` varchar(50),
	`paymentReference` varchar(255),
	`activatedBy` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saas_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `accountStatus` enum('trial','active','expired','suspended') DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `trialStartDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `trialEndDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionPlanId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionStartDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `subscriptionEndDate` timestamp;
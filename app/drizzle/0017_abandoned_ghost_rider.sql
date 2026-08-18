CREATE TABLE `permission_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`description` text,
	`descriptionAr` text,
	`menuItems` json NOT NULL,
	`applicableRoles` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permission_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `permission_groups_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `permission_plan_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planId` int NOT NULL,
	`groupId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `permission_plan_groups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permission_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100) NOT NULL,
	`description` text,
	`descriptionAr` text,
	`role` enum('reseller','client') NOT NULL,
	`isDefault` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permission_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_permission_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`groupId` int NOT NULL,
	`isGranted` boolean NOT NULL,
	`createdBy` int NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_permission_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `permissionPlanId` int;
CREATE TABLE `check_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`ownerId` int NOT NULL,
	`label` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `check_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `check_tokens_token_unique` UNIQUE(`token`)
);

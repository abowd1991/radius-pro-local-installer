CREATE TABLE `network_router_down_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`routerId` int NOT NULL,
	`ownerId` int NOT NULL,
	`routerName` varchar(100) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`eventType` varchar(20) NOT NULL,
	`detectedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`durationSeconds` int,
	`notified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `network_router_down_log_id` PRIMARY KEY(`id`)
);

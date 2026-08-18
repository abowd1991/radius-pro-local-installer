CREATE TABLE `network_routers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`nasId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`description` text,
	`isOnline` boolean NOT NULL DEFAULT false,
	`lastPingMs` int,
	`lastCheckedAt` timestamp,
	`lastSeenOnlineAt` timestamp,
	`consecutiveFailures` int NOT NULL DEFAULT 0,
	`notifyOnDown` boolean NOT NULL DEFAULT true,
	`lastDownNotifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `network_routers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `allocated_vpn_ips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`poolId` int NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`nasId` int NOT NULL,
	`allocatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `allocated_vpn_ips_id` PRIMARY KEY(`id`),
	CONSTRAINT `allocated_vpn_ips_ipAddress_unique` UNIQUE(`ipAddress`),
	CONSTRAINT `allocated_vpn_ips_nasId_unique` UNIQUE(`nasId`)
);
--> statement-breakpoint
CREATE TABLE `vpn_ip_pool` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL DEFAULT 'Default VPN Pool',
	`startIp` varchar(45) NOT NULL,
	`endIp` varchar(45) NOT NULL,
	`gateway` varchar(45) NOT NULL DEFAULT '192.168.30.1',
	`subnet` varchar(45) NOT NULL DEFAULT '255.255.255.0',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vpn_ip_pool_id` PRIMARY KEY(`id`)
);

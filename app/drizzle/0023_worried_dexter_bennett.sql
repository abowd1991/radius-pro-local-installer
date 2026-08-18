CREATE TABLE `ip_pool_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`start_ip` varchar(15) NOT NULL,
	`end_ip` varchar(15) NOT NULL,
	`subnet` varchar(15) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`created_by` int NOT NULL,
	CONSTRAINT `ip_pool_config_id` PRIMARY KEY(`id`)
);

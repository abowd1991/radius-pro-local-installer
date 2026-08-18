CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(50),
	`entityId` int,
	`details` json,
	`ipAddress` varchar(45),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `card_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`planId` int NOT NULL,
	`createdBy` int NOT NULL,
	`resellerId` int,
	`quantity` int NOT NULL,
	`templateImageUrl` text,
	`cardsPerPage` int DEFAULT 8,
	`qrCodeUrl` varchar(255),
	`pdfUrl` text,
	`csvUrl` text,
	`status` enum('generating','completed','failed') NOT NULL DEFAULT 'generating',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `card_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `card_batches_batchId_unique` UNIQUE(`batchId`)
);
--> statement-breakpoint
CREATE TABLE `card_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`resellerId` int,
	`imageUrl` text NOT NULL,
	`usernameX` int DEFAULT 50,
	`usernameY` int DEFAULT 100,
	`passwordX` int DEFAULT 50,
	`passwordY` int DEFAULT 130,
	`qrCodeX` int DEFAULT 200,
	`qrCodeY` int DEFAULT 50,
	`qrCodeSize` int DEFAULT 80,
	`fontSize` int DEFAULT 12,
	`fontColor` varchar(7) DEFAULT '#000000',
	`cardWidth` int DEFAULT 350,
	`cardHeight` int DEFAULT 200,
	`isDefault` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `card_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`senderId` int NOT NULL,
	`message` text NOT NULL,
	`attachmentUrl` text,
	`isRead` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceNumber` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`resellerId` int,
	`type` enum('subscription','card_purchase','deposit','other') NOT NULL,
	`subtotal` decimal(12,2) NOT NULL,
	`tax` decimal(12,2) NOT NULL DEFAULT '0.00',
	`discount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`total` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('draft','pending','paid','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`dueDate` timestamp,
	`paidAt` timestamp,
	`paymentMethod` varchar(50),
	`paymentReference` varchar(255),
	`notes` text,
	`items` json,
	`pdfUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `nas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nasname` varchar(128) NOT NULL,
	`shortname` varchar(32),
	`type` varchar(30) DEFAULT 'other',
	`ports` int,
	`secret` varchar(60) NOT NULL,
	`server` varchar(64),
	`community` varchar(50),
	`description` varchar(200),
	`location` varchar(255),
	`mikrotikApiPort` int DEFAULT 8728,
	`mikrotikApiUser` varchar(64),
	`mikrotikApiPassword` varchar(128),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`lastSeen` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nas_id` PRIMARY KEY(`id`),
	CONSTRAINT `nas_nasname_unique` UNIQUE(`nasname`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('invoice','payment','card','support','balance','subscription','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`titleAr` varchar(255),
	`message` text NOT NULL,
	`messageAr` text,
	`data` json,
	`isRead` boolean DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `online_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`cardId` int,
	`nasId` int,
	`acctSessionId` varchar(64) NOT NULL,
	`framedIpAddress` varchar(15),
	`callingStationId` varchar(50),
	`startTime` timestamp NOT NULL DEFAULT (now()),
	`lastUpdate` timestamp NOT NULL DEFAULT (now()),
	`sessionTime` int DEFAULT 0,
	`inputOctets` bigint DEFAULT 0,
	`outputOctets` bigint DEFAULT 0,
	CONSTRAINT `online_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_gateways` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`displayName` varchar(100) NOT NULL,
	`displayNameAr` varchar(100),
	`type` enum('paypal','stripe','bank_of_palestine','manual') NOT NULL,
	`config` json,
	`isActive` boolean DEFAULT false,
	`testMode` boolean DEFAULT true,
	`supportedCurrencies` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_gateways_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_gateways_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`userId` int NOT NULL,
	`gatewayId` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`status` enum('pending','processing','completed','failed','refunded') NOT NULL DEFAULT 'pending',
	`gatewayTransactionId` varchar(255),
	`gatewayResponse` json,
	`errorMessage` text,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100),
	`description` text,
	`descriptionAr` text,
	`downloadSpeed` int NOT NULL,
	`uploadSpeed` int NOT NULL,
	`dataLimit` bigint,
	`validityType` enum('minutes','hours','days') NOT NULL DEFAULT 'days',
	`validityValue` int NOT NULL DEFAULT 30,
	`validityStartFrom` enum('first_login','card_creation') NOT NULL DEFAULT 'first_login',
	`price` decimal(10,2) NOT NULL,
	`resellerPrice` decimal(10,2) NOT NULL,
	`simultaneousUse` int DEFAULT 1,
	`sessionTimeout` int,
	`idleTimeout` int,
	`poolName` varchar(50),
	`mikrotikRateLimit` varchar(100),
	`mikrotikAddressPool` varchar(50),
	`serviceType` enum('pppoe','hotspot','vpn','all') NOT NULL DEFAULT 'all',
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radacct` (
	`radacctid` bigint AUTO_INCREMENT NOT NULL,
	`acctsessionid` varchar(64) NOT NULL,
	`acctuniqueid` varchar(32) NOT NULL,
	`username` varchar(64) NOT NULL,
	`groupname` varchar(64),
	`realm` varchar(64),
	`nasipaddress` varchar(15) NOT NULL,
	`nasportid` varchar(32),
	`nasporttype` varchar(32),
	`acctstarttime` timestamp,
	`acctupdatetime` timestamp,
	`acctstoptime` timestamp,
	`acctinterval` int,
	`acctsessiontime` int,
	`acctauthentic` varchar(32),
	`connectinfo_start` varchar(50),
	`connectinfo_stop` varchar(50),
	`acctinputoctets` bigint,
	`acctoutputoctets` bigint,
	`calledstationid` varchar(50),
	`callingstationid` varchar(50),
	`acctterminatecause` varchar(32),
	`servicetype` varchar(32),
	`framedprotocol` varchar(32),
	`framedipaddress` varchar(15),
	`framedipv6address` varchar(45),
	`framedipv6prefix` varchar(45),
	`framedinterfaceid` varchar(44),
	`delegatedipv6prefix` varchar(45),
	CONSTRAINT `radacct_radacctid` PRIMARY KEY(`radacctid`),
	CONSTRAINT `radacct_acctuniqueid_unique` UNIQUE(`acctuniqueid`)
);
--> statement-breakpoint
CREATE TABLE `radcheck` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`attribute` varchar(64) NOT NULL,
	`op` varchar(2) NOT NULL DEFAULT ':=',
	`value` varchar(253) NOT NULL,
	CONSTRAINT `radcheck_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radgroupcheck` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupname` varchar(64) NOT NULL,
	`attribute` varchar(64) NOT NULL,
	`op` varchar(2) NOT NULL DEFAULT ':=',
	`value` varchar(253) NOT NULL,
	CONSTRAINT `radgroupcheck_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radgroupreply` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupname` varchar(64) NOT NULL,
	`attribute` varchar(64) NOT NULL,
	`op` varchar(2) NOT NULL DEFAULT '=',
	`value` varchar(253) NOT NULL,
	CONSTRAINT `radgroupreply_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radius_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password` varchar(64) NOT NULL,
	`serialNumber` varchar(20) NOT NULL,
	`batchId` varchar(50),
	`planId` int NOT NULL,
	`createdBy` int NOT NULL,
	`resellerId` int,
	`usedBy` int,
	`status` enum('unused','active','used','expired','suspended','cancelled') NOT NULL DEFAULT 'unused',
	`activatedAt` timestamp,
	`firstLoginAt` timestamp,
	`expiresAt` timestamp,
	`totalSessionTime` int DEFAULT 0,
	`totalDataUsed` bigint DEFAULT 0,
	`lastActivity` timestamp,
	`purchasePrice` decimal(10,2),
	`salePrice` decimal(10,2),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `radius_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `radius_cards_username_unique` UNIQUE(`username`),
	CONSTRAINT `radius_cards_serialNumber_unique` UNIQUE(`serialNumber`)
);
--> statement-breakpoint
CREATE TABLE `radpostauth` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`pass` varchar(64),
	`reply` varchar(32),
	`authdate` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `radpostauth_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radreply` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`attribute` varchar(64) NOT NULL,
	`op` varchar(2) NOT NULL DEFAULT '=',
	`value` varchar(253) NOT NULL,
	CONSTRAINT `radreply_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `radusergroup` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`groupname` varchar(64) NOT NULL,
	`priority` int NOT NULL DEFAULT 1,
	CONSTRAINT `radusergroup_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reseller_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255),
	`companyAddress` text,
	`taxNumber` varchar(50),
	`commissionRate` decimal(5,2) DEFAULT '0.00',
	`creditLimit` decimal(12,2) DEFAULT '0.00',
	`canCreateCards` boolean DEFAULT true,
	`maxClients` int DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reseller_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `reseller_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketNumber` varchar(20) NOT NULL,
	`userId` int NOT NULL,
	`assignedTo` int,
	`subject` varchar(255) NOT NULL,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','waiting','resolved','closed') NOT NULL DEFAULT 'open',
	`category` varchar(50),
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `support_tickets_ticketNumber_unique` UNIQUE(`ticketNumber`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`type` enum('string','number','boolean','json') NOT NULL DEFAULT 'string',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('deposit','withdrawal','card_purchase','subscription','refund','commission') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`balanceBefore` decimal(12,2) NOT NULL,
	`balanceAfter` decimal(12,2) NOT NULL,
	`description` text,
	`referenceType` varchar(50),
	`referenceId` int,
	`status` enum('pending','completed','failed','cancelled') NOT NULL DEFAULT 'completed',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`loginMethod` varchar(64),
	`role` enum('super_admin','reseller','client') NOT NULL DEFAULT 'client',
	`resellerId` int,
	`status` enum('active','suspended','inactive') NOT NULL DEFAULT 'active',
	`language` enum('ar','en') NOT NULL DEFAULT 'ar',
	`avatarUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`balance` decimal(12,2) NOT NULL DEFAULT '0.00',
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallets_userId_unique` UNIQUE(`userId`)
);

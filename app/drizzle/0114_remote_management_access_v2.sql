CREATE TABLE `remote_management_accesses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `nasId` int NOT NULL,
  `createdBy` int NOT NULL,
  `service` enum('winbox') NOT NULL DEFAULT 'winbox',
  `targetPort` int NOT NULL DEFAULT 8291,
  `vpnTunnelIp` varchar(45) NOT NULL,
  `externalPort` int NOT NULL,
  `accessMode` enum('restricted','public') NOT NULL DEFAULT 'restricted',
  `allowedCidrs` json NOT NULL,
  `status` enum('pending','active','disabled','error') NOT NULL DEFAULT 'pending',
  `lastError` text,
  `activatedAt` timestamp NULL,
  `disabledAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `remote_management_owner_nas_service_uniq` (`ownerId`,`nasId`,`service`),
  UNIQUE KEY `remote_management_external_port_uniq` (`externalPort`),
  KEY `remote_management_owner_idx` (`ownerId`),
  KEY `remote_management_status_idx` (`status`)
);
--> statement-breakpoint
CREATE TABLE `remote_management_quotas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `maxAccesses` int NOT NULL DEFAULT 3,
  `usedAccesses` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `remote_management_quotas_ownerId_unique` (`ownerId`)
);

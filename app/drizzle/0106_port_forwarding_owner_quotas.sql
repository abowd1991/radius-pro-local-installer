CREATE TABLE IF NOT EXISTS `port_forwarding_quotas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerId` int NOT NULL,
  `maxForwards` int NOT NULL DEFAULT 10,
  `usedForwards` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `port_forwarding_quotas_id` PRIMARY KEY (`id`),
  CONSTRAINT `port_forwarding_quotas_ownerId_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
INSERT INTO `port_forwarding_quotas` (`ownerId`, `maxForwards`, `usedForwards`)
SELECT `ownerId`, GREATEST(10, COUNT(*)), COUNT(*)
FROM `port_forwardings`
GROUP BY `ownerId`
ON DUPLICATE KEY UPDATE
  `maxForwards` = GREATEST(`port_forwarding_quotas`.`maxForwards`, VALUES(`maxForwards`)),
  `usedForwards` = VALUES(`usedForwards`);

CREATE TABLE `nas_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nasIp` varchar(45) NOT NULL,
	`nasName` varchar(255),
	`ownerId` int,
	`alertType` enum('no_interim_updates','stale_sessions','offline') NOT NULL,
	`message` text NOT NULL,
	`staleCount` int DEFAULT 0,
	`isResolved` boolean NOT NULL DEFAULT false,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nas_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `nas_alerts_nas_ip_idx` ON `nas_alerts` (`nasIp`);--> statement-breakpoint
CREATE INDEX `nas_alerts_owner_id_idx` ON `nas_alerts` (`ownerId`);--> statement-breakpoint
CREATE INDEX `nas_alerts_is_resolved_idx` ON `nas_alerts` (`isResolved`);--> statement-breakpoint
CREATE INDEX `nas_alerts_nas_ip_alert_type_idx` ON `nas_alerts` (`nasIp`,`alertType`);
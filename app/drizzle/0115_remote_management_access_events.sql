CREATE TABLE `remote_management_access_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accessId` int NOT NULL,
  `ownerId` int NOT NULL,
  `actorId` int NOT NULL,
  `action` enum('requested','activation_requested','activated','activation_failed','disable_requested','disabled','reenable_requested','rollback_requested','rollback_completed','rollback_failed') NOT NULL,
  `details` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `remote_management_access_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `remote_management_events_access_idx` ON `remote_management_access_events` (`accessId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `remote_management_events_owner_idx` ON `remote_management_access_events` (`ownerId`,`createdAt`);

CREATE TABLE `speed_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`planId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`startHour` int NOT NULL,
	`endHour` int NOT NULL,
	`daysOfWeek` json NOT NULL,
	`downloadKbps` int NOT NULL,
	`uploadKbps` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `speed_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `speed_schedules_owner_plan_idx` ON `speed_schedules` (`ownerId`,`planId`);--> statement-breakpoint
CREATE INDEX `speed_schedules_plan_active_idx` ON `speed_schedules` (`planId`,`isActive`);
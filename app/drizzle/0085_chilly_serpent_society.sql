CREATE TABLE `user_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`sessionToken` varchar(128) NOT NULL,
	`rememberMe` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`userAgent` text,
	`ipAddress` varchar(45),
	`deviceName` varchar(255),
	`revokedAt` timestamp,
	`revokedReason` enum('logout','password_change','admin_revoke','expired'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE INDEX `user_sessions_user_id_idx` ON `user_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `user_sessions_token_idx` ON `user_sessions` (`sessionToken`);--> statement-breakpoint
CREATE INDEX `user_sessions_expires_at_idx` ON `user_sessions` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `user_sessions_last_activity_idx` ON `user_sessions` (`lastActivityAt`);
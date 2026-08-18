ALTER TABLE `check_tokens` ADD `widgetEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetPrimaryColor` varchar(7) DEFAULT '#0ea5e9' NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetBgColor` varchar(7) DEFAULT '#ffffff' NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetTextColor` varchar(7) DEFAULT '#1e293b' NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetBorderRadius` int DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowPlan` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowExpiry` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowTimeLeft` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowStatus` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowSpeed` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowDataLimit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetShowSessions` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetTitle` varchar(128) DEFAULT 'فحص بيانات كرتك' NOT NULL;--> statement-breakpoint
ALTER TABLE `check_tokens` ADD `widgetPlaceholder` varchar(128) DEFAULT 'أدخل اسم المستخدم' NOT NULL;
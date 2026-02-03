-- Migration: Make email optional
-- WARNING: Destructive migration - creates new table, copies data, drops old table
-- Recovery: If migration fails mid-way, restore from backup or re-run from scratch
-- D1/SQLite limitation: DDL statements auto-commit, so BEGIN/COMMIT won't help
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `users_new` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`subdomain` text NOT NULL,
	`theme` text DEFAULT 'default',
	`settings` text DEFAULT '{}',
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `users_new` (`id`, `email`, `subdomain`, `theme`, `settings`, `created_at`, `updated_at`)
SELECT `id`, `email`, `subdomain`, `theme`, `settings`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_subdomain_unique` ON `users` (`subdomain`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;

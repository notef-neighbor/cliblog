-- Migration: Make slug, title, content_key nullable for pending translations
-- WARNING: Destructive migration - creates new table, copies data, drops old table
-- Recovery: If migration fails mid-way:
--   1. Check if posts_new exists: SELECT name FROM sqlite_master WHERE name='posts_new'
--   2. If posts_new has data and posts is gone: ALTER TABLE posts_new RENAME TO posts
--   3. If both exist: DROP TABLE posts_new and retry migration
--   4. Recreate indexes manually if needed
-- D1/SQLite limitation: DDL statements auto-commit, so BEGIN/COMMIT won't help
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `posts_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`slug` text,
	`title` text,
	`content_key` text,
	`excerpt` text,
	`tags` text DEFAULT '[]',
	`status` text DEFAULT 'draft',
	`published_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`locale` text,
	`original_post_id` text REFERENCES `posts`(`id`) ON DELETE CASCADE,
	`translation_status` text DEFAULT 'ready',
	`source_revision` text,
	`translated_at` text,
	`translation_locked` integer DEFAULT 0,
	`last_translation_error` text
);
--> statement-breakpoint
INSERT INTO `posts_new` (`id`, `user_id`, `slug`, `title`, `content_key`, `excerpt`, `tags`, `status`, `published_at`, `created_at`, `updated_at`, `locale`, `original_post_id`, `translation_status`, `source_revision`, `translated_at`, `translation_locked`, `last_translation_error`)
SELECT `id`, `user_id`, `slug`, `title`, `content_key`, `excerpt`, `tags`, `status`, `published_at`, `created_at`, `updated_at`, `locale`, `original_post_id`, `translation_status`, `source_revision`, `translated_at`, `translation_locked`, `last_translation_error` FROM `posts`;
--> statement-breakpoint
DROP TABLE `posts`;
--> statement-breakpoint
ALTER TABLE `posts_new` RENAME TO `posts`;
--> statement-breakpoint
-- Recreate indexes
CREATE INDEX `idx_posts_user_status` ON `posts`(`user_id`, `status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_translation` ON `posts`(`original_post_id`, `locale`) WHERE `original_post_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_slug_locale` ON `posts`(`user_id`, `slug`, `locale`) WHERE `slug` IS NOT NULL;
--> statement-breakpoint
PRAGMA foreign_keys=ON;

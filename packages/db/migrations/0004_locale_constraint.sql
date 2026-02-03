-- Migration: Add CHECK constraint for locale on translations
-- Ensures translations (posts with original_post_id) always have a locale
-- This prevents NULL locale issues with the unique index

-- SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we recreate the table
-- WARNING: Destructive migration - see 0003 for recovery instructions

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
	`last_translation_error` text,
	CHECK (original_post_id IS NULL OR locale IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `posts_new` SELECT * FROM `posts`;
--> statement-breakpoint
DROP TABLE `posts`;
--> statement-breakpoint
ALTER TABLE `posts_new` RENAME TO `posts`;
--> statement-breakpoint
CREATE INDEX `idx_posts_user_status` ON `posts`(`user_id`, `status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_translation` ON `posts`(`original_post_id`, `locale`) WHERE `original_post_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_posts_slug_locale` ON `posts`(`user_id`, `slug`, `locale`) WHERE `slug` IS NOT NULL;
--> statement-breakpoint
PRAGMA foreign_keys=ON;

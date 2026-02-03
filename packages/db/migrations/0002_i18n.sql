-- i18n: Add translation support columns to posts and users tables
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `locale` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `original_post_id` text REFERENCES `posts`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `translation_status` text DEFAULT 'ready';
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `source_revision` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `translated_at` text;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `translation_locked` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `last_translation_error` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `default_translation_locales` text;
--> statement-breakpoint
-- Unique index: one translation per locale per original post
CREATE UNIQUE INDEX `idx_posts_translation` ON `posts`(`original_post_id`, `locale`) WHERE `original_post_id` IS NOT NULL;
--> statement-breakpoint
-- Unique index: (user_id, slug, locale) must be unique when slug is not null
CREATE UNIQUE INDEX `idx_posts_slug_locale` ON `posts`(`user_id`, `slug`, `locale`) WHERE `slug` IS NOT NULL;

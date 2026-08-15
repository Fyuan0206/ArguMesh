ALTER TABLE `papers` ADD `reading_status` text DEFAULT '待读' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `tags_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `file_name` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `page_count` integer;--> statement-breakpoint
ALTER TABLE `papers` ADD `outline_json` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `sort_order` integer DEFAULT 0 NOT NULL;
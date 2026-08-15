CREATE TABLE `matrices` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`extraction_progress` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matrices_project_created_idx` ON `matrices` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `matrix_papers` (
	`matrix_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`matrix_id`, `paper_id`),
	FOREIGN KEY (`matrix_id`) REFERENCES `matrices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matrix_papers_order_idx` ON `matrix_papers` (`matrix_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `dimensions` ADD `matrix_id` text;--> statement-breakpoint
CREATE INDEX `dimensions_matrix_order_idx` ON `dimensions` (`matrix_id`,`sort_order`);--> statement-breakpoint
ALTER TABLE `evidence_cells` ADD `matrix_id` text;--> statement-breakpoint
ALTER TABLE `extraction_jobs` ADD `matrix_id` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `authors` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `papers` ADD `abstract` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `doi` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `arxiv_id` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `source_url` text;--> statement-breakpoint
ALTER TABLE `papers` ADD `file_hash` text;
--> statement-breakpoint
INSERT OR IGNORE INTO `matrices` (`id`, `project_id`, `name`, `description`, `extraction_progress`, `created_at`)
SELECT `id`, `id`, `name` || ' · 证据矩阵', `description`, `extraction_progress`, `created_at` FROM `projects`;
--> statement-breakpoint
INSERT OR IGNORE INTO `matrix_papers` (`matrix_id`, `paper_id`, `sort_order`)
SELECT `project_id`, `paper_id`, `sort_order` FROM `project_papers`;
--> statement-breakpoint
UPDATE `dimensions` SET `matrix_id` = `project_id` WHERE `matrix_id` IS NULL;
--> statement-breakpoint
UPDATE `evidence_cells` SET `matrix_id` = `project_id` WHERE `matrix_id` IS NULL;

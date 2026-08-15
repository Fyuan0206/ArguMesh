CREATE TABLE `dimensions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`group_key` text NOT NULL,
	`group_label` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dimensions_order_idx` ON `dimensions` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `evidence_cells` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`dimension_id` text NOT NULL,
	`value` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`claim` text NOT NULL,
	`source_page` text NOT NULL,
	`source_section` text NOT NULL,
	`source_excerpt` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dimension_id`) REFERENCES `dimensions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_project_paper_dimension_idx` ON `evidence_cells` (`project_id`,`paper_id`,`dimension_id`);--> statement-breakpoint
CREATE TABLE `extraction_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`candidate_count` integer DEFAULT 0 NOT NULL,
	`plan` text,
	`error` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extraction_jobs_project_created_idx` ON `extraction_jobs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `papers` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`short_name` text NOT NULL,
	`venue` text NOT NULL,
	`year` integer NOT NULL,
	`r2_key` text,
	`mime_type` text,
	`file_size` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `project_papers` (
	`project_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `paper_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_papers_order_idx` ON `project_papers` (`project_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`extraction_progress` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `evidence_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`knowledge_item_id` text,
	`parent_id` text,
	`level` text DEFAULT 'raw' NOT NULL,
	`content` text NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`location` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`promoted_to` text,
	`source` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_layers_project_created_idx` ON `evidence_layers` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `evidence_layers_owner_idx` ON `evidence_layers` (`owner_id`);--> statement-breakpoint
CREATE INDEX `evidence_layers_knowledge_idx` ON `evidence_layers` (`knowledge_item_id`);--> statement-breakpoint
CREATE INDEX `evidence_layers_parent_idx` ON `evidence_layers` (`parent_id`);--> statement-breakpoint
CREATE TABLE `experiment_results` (
	`id` text PRIMARY KEY NOT NULL,
	`experiment_id` text NOT NULL,
	`run_no` integer NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`figures_json` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `experiment_results_exp_idx` ON `experiment_results` (`experiment_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_results_exp_run_uniq` ON `experiment_results` (`experiment_id`,`run_no`);--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`idea_id` text,
	`rq_id` text,
	`title` text NOT NULL,
	`hypothesis` text DEFAULT '' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`repo_url` text DEFAULT '' NOT NULL,
	`commit_hash` text DEFAULT '' NOT NULL,
	`checkpoint_path` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`conclusion` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rq_id`) REFERENCES `research_questions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `experiments_project_created_idx` ON `experiments` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `experiments_owner_idx` ON `experiments` (`owner_id`);--> statement-breakpoint
CREATE INDEX `experiments_idea_idx` ON `experiments` (`idea_id`);--> statement-breakpoint
CREATE INDEX `experiments_rq_idx` ON `experiments` (`rq_id`);--> statement-breakpoint
CREATE TABLE `gap_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`gap_id` text NOT NULL,
	`knowledge_item_id` text NOT NULL,
	`stance` text DEFAULT 'supports' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`gap_id`) REFERENCES `gaps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gap_evidence_gap_item_idx` ON `gap_evidence` (`gap_id`,`knowledge_item_id`);--> statement-breakpoint
CREATE INDEX `gap_evidence_gap_idx` ON `gap_evidence` (`gap_id`);--> statement-breakpoint
CREATE TABLE `gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`paper_id` text,
	`rq_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`source` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rq_id`) REFERENCES `research_questions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `gaps_project_created_idx` ON `gaps` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `gaps_owner_idx` ON `gaps` (`owner_id`);--> statement-breakpoint
CREATE INDEX `gaps_rq_idx` ON `gaps` (`rq_id`);--> statement-breakpoint
CREATE TABLE `idea_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`knowledge_item_id` text NOT NULL,
	`role` text DEFAULT 'supports' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`knowledge_item_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idea_evidence_idea_item_idx` ON `idea_evidence` (`idea_id`,`knowledge_item_id`);--> statement-breakpoint
CREATE INDEX `idea_evidence_idea_idx` ON `idea_evidence` (`idea_id`);--> statement-breakpoint
CREATE TABLE `idea_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`idea_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`verdict` text DEFAULT 'viable' NOT NULL,
	`strengths` text DEFAULT '' NOT NULL,
	`weaknesses` text DEFAULT '' NOT NULL,
	`risks` text DEFAULT '' NOT NULL,
	`suggestions_json` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`reviewed_version_id` text,
	`revised_version_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_version_id`) REFERENCES `idea_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revised_version_id`) REFERENCES `idea_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idea_reviews_idea_created_idx` ON `idea_reviews` (`idea_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idea_reviews_owner_idx` ON `idea_reviews` (`owner_id`);--> statement-breakpoint
CREATE TABLE `idea_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`title` text NOT NULL,
	`canvas_json` text DEFAULT '{}' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idea_versions_idea_no_idx` ON `idea_versions` (`idea_id`,`version_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `idea_versions_idea_no_uniq` ON `idea_versions` (`idea_id`,`version_no`);--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`source_gap_id` text,
	`rq_id` text,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Inbox' NOT NULL,
	`current_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_gap_id`) REFERENCES `gaps`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rq_id`) REFERENCES `research_questions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ideas_project_created_idx` ON `ideas` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ideas_owner_idx` ON `ideas` (`owner_id`);--> statement-breakpoint
CREATE INDEX `ideas_gap_idx` ON `ideas` (`source_gap_id`);--> statement-breakpoint
CREATE INDEX `ideas_rq_idx` ON `ideas` (`rq_id`);--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`quote` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`location` text,
	`source` text DEFAULT 'human' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`model` text,
	`generated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_items_project_created_idx` ON `knowledge_items` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `knowledge_items_owner_idx` ON `knowledge_items` (`owner_id`);--> statement-breakpoint
CREATE TABLE `knowledge_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`source_id` text NOT NULL,
	`target_id` text NOT NULL,
	`type` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `knowledge_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_relations_edge_type_idx` ON `knowledge_relations` (`project_id`,`source_id`,`target_id`,`type`);--> statement-breakpoint
CREATE INDEX `knowledge_relations_project_idx` ON `knowledge_relations` (`project_id`);--> statement-breakpoint
CREATE TABLE `research_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`project_id` text NOT NULL,
	`question` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'human' NOT NULL,
	`model` text,
	`generated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rq_project_created_idx` ON `research_questions` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `rq_owner_idx` ON `research_questions` (`owner_id`);--> statement-breakpoint
CREATE TABLE `rq_papers` (
	`rq_id` text NOT NULL,
	`paper_id` text NOT NULL,
	`project_id` text NOT NULL,
	`role` text DEFAULT 'related' NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`rq_id`, `paper_id`),
	FOREIGN KEY (`rq_id`) REFERENCES `research_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rq_papers_project_idx` ON `rq_papers` (`project_id`);
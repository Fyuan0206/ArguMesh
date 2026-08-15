CREATE TABLE `paper_files` (
	`paper_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`data` blob NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `papers`(`id`) ON UPDATE no action ON DELETE cascade
);

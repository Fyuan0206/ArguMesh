CREATE TABLE `ai_settings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);

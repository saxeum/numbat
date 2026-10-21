CREATE TABLE `catalog_probes` (
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`status` text NOT NULL,
	`checked_at` text NOT NULL,
	PRIMARY KEY(`provider`, `model_id`)
);
--> statement-breakpoint
CREATE TABLE `catalog_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`providers` text DEFAULT '[]' NOT NULL,
	`error` text
);
--> statement-breakpoint
ALTER TABLE `free_models` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `free_models` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `free_models` ADD `note` text;
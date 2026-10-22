CREATE TABLE `probe_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`credential_id` text,
	`provider` text NOT NULL,
	`label` text,
	`status` text NOT NULL,
	`trigger` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`duration_ms` integer,
	`progress_done` integer DEFAULT 0 NOT NULL,
	`progress_total` integer DEFAULT 0 NOT NULL,
	`totals_json` text DEFAULT '{}' NOT NULL,
	`error` text,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `provider_credentials`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `probe_runs_owner_created_idx` ON `probe_runs` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `probe_run_models` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`resolved_model` text,
	`kind` text NOT NULL,
	`attempted` integer NOT NULL,
	`ok` integer NOT NULL,
	`status` integer,
	`status_text` text,
	`duration_ms` integer,
	`ttft_ms` integer,
	`completion_tokens` integer,
	`reasoning_tokens` integer,
	`tps` real,
	`thinking` integer,
	`content` text,
	`error_name` text,
	`error_message` text,
	`body` text,
	`request_body` text,
	`headers_json` text,
	`quota_state` text,
	`quota_limits_json` text,
	`quota_retry_after_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `probe_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `probe_run_models_run_idx` ON `probe_run_models` (`run_id`);--> statement-breakpoint
CREATE INDEX `probe_run_models_owner_model_idx` ON `probe_run_models` (`owner_id`,`provider`,`model_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `model_availability` (
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`resolved_model` text,
	`available` integer NOT NULL,
	`last_status` integer,
	`last_ok_at` text,
	`last_checked_at` text NOT NULL,
	`source_run_id` text,
	PRIMARY KEY(`owner_id`, `provider`, `model_id`)
);
--> statement-breakpoint
CREATE INDEX `model_availability_owner_available_idx` ON `model_availability` (`owner_id`,`available`,`provider`);

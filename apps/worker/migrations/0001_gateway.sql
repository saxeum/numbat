CREATE TABLE `free_models` (
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`label` text NOT NULL,
	`context` integer,
	`free` integer DEFAULT true NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`provider`, `model_id`)
);
--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`key_version` integer NOT NULL,
	`wrapped_dek` text NOT NULL,
	`iv` text NOT NULL,
	`ciphertext` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `provider_credentials_ownerId_idx` ON `provider_credentials` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `provider_credentials_owner_provider_label_unq` ON `provider_credentials` (`owner_id`,`provider`,`label`);
-- Extended-thinking text for the collapsible "Thinking" block on assistant
-- messages, plus how long the model thought before the answer started.

ALTER TABLE `messages` ADD COLUMN `reasoning` text;--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `reasoning_ms` integer;

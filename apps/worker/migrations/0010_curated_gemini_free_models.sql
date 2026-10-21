-- Curated Gemini free-tier catalog.
--
-- Replaces automated catalog discovery for Gemini: the nightly KAN-44
-- discovery cron is removed, so this migration is the source of truth for the
-- Gemini rows. These are the only Google AI free-tier models with usable rate
-- limits (source: Google AI Studio rate-limit dashboard, 2026-10-21):
--
--   gemini-3.1-flash-lite   RPM 15 · TPM 250K · RPD 500
--   gemini-3.5-flash-lite   RPM 15 · TPM 250K · RPD 500
--   gemma-4-31b-it          RPM 30 · TPM 16K  · RPD 14.4K
--   gemma-4-26b-a4b-it      RPM 30 · TPM 16K  · RPD 14.4K
--
-- Safe to re-run: it clears the existing Gemini rows first.

DELETE FROM `free_models` WHERE `provider` = 'gemini';--> statement-breakpoint
INSERT INTO `free_models` (`provider`, `model_id`, `label`, `context`, `free`, `sort`, `note`) VALUES
  ('gemini', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite', 1048576, 1, 10, 'free tier (rate-limited)'),
  ('gemini', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 1048576, 1, 11, 'free tier (rate-limited)'),
  ('gemini', 'gemma-4-31b-it', 'Gemma 4 31B', 262144, 1, 12, 'free tier (rate-limited)'),
  ('gemini', 'gemma-4-26b-a4b-it', 'Gemma 4 26B', 262144, 1, 13, 'free tier (rate-limited)');

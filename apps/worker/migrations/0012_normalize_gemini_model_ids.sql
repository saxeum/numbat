-- Normalize Google Gemini model ids.
--
-- The Gemini probe uses Google's OpenAI shim, which lists models as
-- `models/gemini-…`. The gateway's native chat path already inserts `models/`,
-- so a stored prefixed id produced `…/v1beta/models/models/gemini-…` (HTTP 404
-- from Google). Strip the prefix so availability, the picker and the gateway
-- agree. Safe to run once; guarded to Gemini rows only.

DELETE FROM `model_availability`
WHERE `provider` = 'gemini' AND `model_id` LIKE 'models/%'
  AND EXISTS (
    SELECT 1 FROM `model_availability` AS `other`
    WHERE `other`.`owner_id` = `model_availability`.`owner_id`
      AND `other`.`provider` = `model_availability`.`provider`
      AND `other`.`model_id` = substr(`model_availability`.`model_id`, 8)
  );--> statement-breakpoint
UPDATE `model_availability`
SET `model_id` = substr(`model_id`, 8)
WHERE `provider` = 'gemini' AND `model_id` LIKE 'models/%';--> statement-breakpoint
UPDATE `probe_run_models`
SET `resolved_model` = substr(`resolved_model`, 8)
WHERE `provider` = 'gemini' AND `resolved_model` LIKE 'models/%';--> statement-breakpoint
UPDATE `probe_run_models`
SET `model_id` = substr(`model_id`, 8)
WHERE `provider` = 'gemini' AND `model_id` LIKE 'models/%';

-- NVIDIA NIM: seed only the models that actually respond.
-- NVIDIA's /v1/models lists end-of-life (410) and account-unavailable (404)
-- models, so the list cannot be trusted. These ids returned 200 to a
-- max_tokens=1 chat probe.
DELETE FROM `free_models` WHERE `provider` = 'nvidia';
INSERT INTO `free_models` (`provider`, `model_id`, `label`, `context`, `free`, `sort`) VALUES
  ('nvidia', 'deepseek-ai/deepseek-v4.1-flash', 'deepseek-ai/deepseek-v4.1-flash', NULL, 1, 200),
  ('nvidia', 'google/diffusiongemma-26b-a4b-it', 'google/diffusiongemma-26b-a4b-it', NULL, 1, 201),
  ('nvidia', 'google/gemma-4-31b-it', 'google/gemma-4-31b-it', NULL, 1, 202),
  ('nvidia', 'meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-11b-vision-instruct', NULL, 1, 203),
  ('nvidia', 'meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-90b-vision-instruct', NULL, 1, 204),
  ('nvidia', 'meta/muse-glimmer-30b', 'meta/muse-glimmer-30b', NULL, 1, 205),
  ('nvidia', 'nvidia/ising-calibration-1.5-31b', 'nvidia/ising-calibration-1.5-31b', NULL, 1, 206),
  ('nvidia', 'nvidia/llama-3.1-nemotron-safety-guard-8b-v3', 'nvidia/llama-3.1-nemotron-safety-guard-8b-v3', NULL, 1, 207),
  ('nvidia', 'nvidia/nemotron-3-ultra-550b-a55b', 'nvidia/nemotron-3-ultra-550b-a55b', NULL, 1, 208),
  ('nvidia', 'nvidia/nemotron-3.5-content-safety', 'nvidia/nemotron-3.5-content-safety', NULL, 1, 209),
  ('nvidia', 'nvidia/nemotron-3.5-lightning-30b-a3b', 'nvidia/nemotron-3.5-lightning-30b-a3b', NULL, 1, 210),
  ('nvidia', 'nvidia/nemotron-3.5-super-vl-120b-a12b', 'nvidia/nemotron-3.5-super-vl-120b-a12b', NULL, 1, 211),
  ('nvidia', 'nvidia/nemotron-parse-2.0', 'nvidia/nemotron-parse-2.0', NULL, 1, 212),
  ('nvidia', 'nvidia/riva-translate-4b-instruct-v2', 'nvidia/riva-translate-4b-instruct-v2', NULL, 1, 213),
  ('nvidia', 'openai/gpt-oss-20b', 'openai/gpt-oss-20b', NULL, 1, 214),
  ('nvidia', 'poolside/laguna-xs-2.1', 'poolside/laguna-xs-2.1', NULL, 1, 215),
  ('nvidia', 'stepfun-ai/step-5-preview', 'stepfun-ai/step-5-preview', NULL, 1, 216),
  ('nvidia', 'z-ai/glm-5.3', 'z-ai/glm-5.3', NULL, 1, 217),
  ('nvidia', 'z-ai/glm-5.3-flash', 'z-ai/glm-5.3-flash', NULL, 1, 218);

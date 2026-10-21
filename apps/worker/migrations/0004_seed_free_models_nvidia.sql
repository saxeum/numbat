-- NVIDIA NIM free-tier models (static seed, not live-probed). NVIDIA rotates its
-- catalog, so treat this as a starting set: verify ids with
--   GET https://integrate.api.nvidia.com/v1/models
-- using your `nvapi-…` key. See docs/free-token-onboarding.md.
INSERT OR IGNORE INTO `free_models` (`provider`, `model_id`, `label`, `context`, `free`, `sort`) VALUES
  ('nvidia', 'meta/llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 131072, 1, 30),
  ('nvidia', 'meta/llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct', 131072, 1, 31),
  ('nvidia', 'nvidia/llama-3.3-nemotron-super-49b-v1', 'Nemotron Super 49B', 131072, 1, 32),
  ('nvidia', 'deepseek-ai/deepseek-r1', 'DeepSeek R1', 131072, 1, 33),
  ('nvidia', 'qwen/qwen2.5-coder-32b-instruct', 'Qwen2.5 Coder 32B', 32768, 1, 34);

-- Static free-tier model catalog for the POC (Gemini + Groq).
-- Seeded, not live-probed. Source: byokfree docs/free-models-report-2026-10-21.md.
INSERT OR IGNORE INTO `free_models` (`provider`, `model_id`, `label`, `context`, `free`, `sort`) VALUES
  ('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B', 131072, 1, 10),
  ('groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B', 131072, 1, 11),
  ('groq', 'openai/gpt-oss-safeguard-20b', 'GPT-OSS Safeguard 20B', 131072, 1, 12),
  ('groq', 'qwen/qwen3.8-27b', 'Qwen3.8 27B', 131072, 1, 13),
  ('groq', 'allam-2-7b', 'Allam 2 7B', 4096, 1, 14),
  ('gemini', 'gemini-flash-lite-latest', 'Gemini Flash Lite', 1048576, 1, 20),
  ('gemini', 'gemini-flash-latest', 'Gemini Flash', 1048576, 1, 21),
  ('gemini', 'gemini-pro-latest', 'Gemini Pro', 1048576, 1, 22);

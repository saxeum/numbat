#!/usr/bin/env node
// Refresh the numbat free-model catalog from live provider data.
//
// For every in-scope provider that has a key configured, this lists candidate
// chat models, sends ONE real chat completion per model, and keeps only models
// that return a non-empty assistant message. It then emits (or writes) a D1
// migration that drops and recreates `free_models` with the survivors — so every
// seeded model has been smoke tested with a real chat.
//
// Usage:
//   node scripts/generate-free-models-migration.mjs                    # dry run, prints SQL
//   node scripts/generate-free-models-migration.mjs --provider=groq
//   node scripts/generate-free-models-migration.mjs --limit=5 --sleep=500
//   node scripts/generate-free-models-migration.mjs --retries=3
//   node scripts/generate-free-models-migration.mjs --concurrency=8    # parallel probes per provider
//   node scripts/generate-free-models-migration.mjs --write            # write the .sql
//   node scripts/generate-free-models-migration.mjs --allow-missing    # skip keyless providers
//
// Keys come from the environment, then `.env` at the repo root (gitignored).
// Probes spend free-tier quota: keep --limit low and the default sleep.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "apps", "worker", "migrations");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const providerFilter =
  args.provider && args.provider !== "all"
    ? String(args.provider)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;
const limit = args.limit ? Number.parseInt(String(args.limit), 10) : Infinity;
const sleepMs = args.sleep ? Number.parseInt(String(args.sleep), 10) : 0;
const retries = args.retries ? Number.parseInt(String(args.retries), 10) : 1;
const concurrencyOverride = args.concurrency
  ? Number.parseInt(String(args.concurrency), 10)
  : null;
const timeoutMs = args.timeout
  ? Number.parseInt(String(args.timeout), 10)
  : 12_000;
const write = args.write === true || args.write === "true";
const allowMissing =
  args["allow-missing"] === true || args["allow-missing"] === "true";
const prompt = args.prompt
  ? String(args.prompt)
  : "Reply with exactly one word: pong";

// --- env ------------------------------------------------------------------

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, ".env"));
loadEnvFile(join(ROOT, "apps", "worker", ".dev.vars"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `fn` over `items` with at most `concurrency` in flight; order preserved. */
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  const size = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

function keyFor(spec) {
  for (const name of spec.keyNames) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

function short(text, max = 120) {
  const value = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function getJson(url, headers, provider) {
  let status;
  let text;
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    text = await res.text();
  } catch (error) {
    throw new Error(
      `${provider}: list models failed (${error?.name ?? error})`,
    );
  }
  if (status < 200 || status >= 300) {
    throw new Error(`${provider}: list models failed (HTTP ${status})`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${provider}: list models returned non-JSON`);
  }
}

// --- discovery ------------------------------------------------------------

// Groq's /models also lists audio and guard models; only these are chat.
function isGroqChatModel(id) {
  if (
    id.includes("whisper") ||
    id.includes("orpheus") ||
    id.includes("prompt-guard")
  ) {
    return false;
  }
  return (
    id.includes("gpt-oss") ||
    id.includes("qwen") ||
    id.includes("allam") ||
    id.includes("llama")
  );
}

async function discoverGemini(key) {
  const body = await getJson(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    { "x-goog-api-key": key },
    "gemini",
  );
  return (body.models ?? [])
    .filter((model) =>
      (model.supportedGenerationMethods ?? []).includes("generateContent"),
    )
    .map((model) => {
      const id = String(model.name ?? "").replace(/^models\//, "");
      return {
        id,
        label: model.displayName ?? id,
        context:
          typeof model.inputTokenLimit === "number"
            ? model.inputTokenLimit
            : undefined,
      };
    })
    .filter((model) => model.id);
}

async function discoverGroq(key) {
  const body = await getJson(
    "https://api.groq.com/openai/v1/models",
    { authorization: `Bearer ${key}` },
    "groq",
  );
  return (body.data ?? [])
    .filter((model) => isGroqChatModel(String(model.id)))
    .map((model) => ({
      id: String(model.id),
      label: String(model.id),
      context:
        typeof model.context_window === "number"
          ? model.context_window
          : undefined,
    }));
}

async function discoverNvidia(key) {
  const body = await getJson(
    "https://integrate.api.nvidia.com/v1/models",
    { authorization: `Bearer ${key}` },
    "nvidia",
  );
  return (body.data ?? [])
    .map((model) => ({
      id: String(model.id),
      label: typeof model.name === "string" ? model.name : String(model.id),
      context:
        typeof model.context_length === "number"
          ? model.context_length
          : undefined,
    }))
    .filter((model) => model.id);
}

async function discoverOpenRouter(key) {
  const body = await getJson(
    "https://openrouter.ai/api/v1/models",
    { authorization: `Bearer ${key}` },
    "openrouter",
  );
  return (body.data ?? [])
    .filter(
      (model) =>
        String(model.pricing?.prompt ?? "") === "0" &&
        String(model.pricing?.completion ?? "") === "0",
    )
    .map((model) => ({
      id: String(model.id),
      label: typeof model.name === "string" ? model.name : String(model.id),
      context:
        typeof model.context_length === "number"
          ? model.context_length
          : undefined,
    }));
}

// --- smoke test (one real chat per model) ---------------------------------

function ok() {
  return { ok: true, status: 200 };
}

function fail(status, detail) {
  return { ok: false, status, detail: detail ? short(detail) : undefined };
}

async function probeGemini(key, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent`;
  let res;
  let text;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 128, temperature: 0 },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (error) {
    return fail(0, error?.name ?? error);
  }
  if (!res.ok) return fail(res.status, text);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(res.status, "non-JSON response");
  }
  const content = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part?.text ?? "")
    .join("")
    .trim();
  return content ? ok() : fail(res.status, "empty content");
}

async function probeOpenAI(key, model) {
  const url = `${model.chatUrl}`;
  let res;
  let text;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 128,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (error) {
    return fail(0, error?.name ?? error);
  }
  if (!res.ok) return fail(res.status, text);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(res.status, "non-JSON response");
  }
  const content = String(body.choices?.[0]?.message?.content ?? "").trim();
  return content ? ok() : fail(res.status, "empty content");
}

// --- providers ------------------------------------------------------------

const PROVIDERS = [
  {
    id: "gemini",
    label: "Google Gemini",
    keyNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    sortBase: 10,
    concurrency: 2,
    discover: discoverGemini,
    probe: (key, model) => probeGemini(key, model),
  },
  {
    id: "groq",
    label: "Groq",
    keyNames: ["GROQ_API_KEY"],
    sortBase: 100,
    concurrency: 4,
    discover: discoverGroq,
    probe: (key, model) =>
      probeOpenAI(key, {
        ...model,
        chatUrl: "https://api.groq.com/openai/v1/chat/completions",
      }),
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    keyNames: ["NVIDIA_API_KEY"],
    sortBase: 200,
    concurrency: 6,
    discover: discoverNvidia,
    probe: (key, model) =>
      probeOpenAI(key, {
        ...model,
        chatUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
      }),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyNames: ["OPENROUTER_API_KEY"],
    sortBase: 300,
    concurrency: 3,
    discover: discoverOpenRouter,
    probe: (key, model) =>
      probeOpenAI(key, {
        ...model,
        chatUrl: "https://openrouter.ai/api/v1/chat/completions",
      }),
  },
];

function statusLabel(result) {
  if (result.ok) return "PASS";
  if (result.status === 429) return "RATE-LIMITED";
  if (result.status === 401 || result.status === 403) return "NO AUTH";
  if (result.status === 402) return "PAYMENT";
  if (result.status === 404 || result.status === 410) return "NOT AVAILABLE";
  if (result.status === 400) return "BAD REQUEST";
  if (result.status === 0) return "NETWORK";
  if (result.status === 200) return "EMPTY";
  return `ERR ${result.status}`;
}

// Transient failures worth retrying before excluding a model.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

// --- main -----------------------------------------------------------------

const inScope = PROVIDERS.filter(
  (spec) => !providerFilter || providerFilter.includes(spec.id),
);

if (inScope.length === 0) {
  console.error(
    `No providers matched --provider=${args.provider}. Known: ${PROVIDERS.map((p) => p.id).join(", ")}`,
  );
  process.exit(1);
}

const missing = inScope.filter((spec) => !keyFor(spec));
if (missing.length > 0 && !allowMissing) {
  console.error(
    "Missing provider keys for: " + missing.map((s) => s.id).join(", "),
  );
  for (const spec of missing) {
    console.error(`  ${spec.id}: set one of ${spec.keyNames.join(", ")}`);
  }
  console.error(
    "Add the keys to .env, or pass --allow-missing to omit those providers (their catalog rows will be dropped).",
  );
  process.exit(1);
}

const kept = [];
const summary = [];

for (const spec of inScope) {
  const key = keyFor(spec);
  if (!key) {
    console.log(`\n${spec.label}: SKIP (no key)`);
    continue;
  }

  console.log(`\n${spec.label}: listing models…`);
  let candidates;
  try {
    candidates = await spec.discover(key);
  } catch (error) {
    console.error(`  ${error.message}`);
    continue;
  }

  const tested = Number.isFinite(limit)
    ? candidates.slice(0, limit)
    : candidates;
  console.log(
    `  ${tested.length} candidate(s), smoke testing a real chat each`,
  );

  const passed = [];
  const counts = new Map();
  const poolSize = concurrencyOverride ?? spec.concurrency ?? 4;
  const results = await mapPool(tested, poolSize, async (model) => {
    let result = await spec.probe(key, model);
    for (
      let attempt = 1;
      attempt <= retries && !result.ok && RETRYABLE.has(result.status);
      attempt++
    ) {
      const wait = result.status === 429 ? 3_000 * attempt : 1_000 * attempt;
      console.log(
        `  retry ${attempt}/${retries}  ${model.id} (${statusLabel(result)}, waiting ${wait}ms)`,
      );
      await sleep(wait);
      result = await spec.probe(key, model);
    }
    if (sleepMs > 0) await sleep(sleepMs);
    return { model, result };
  });

  for (const { model, result } of results) {
    counts.set(statusLabel(result), (counts.get(statusLabel(result)) ?? 0) + 1);
    if (result.ok) {
      passed.push(model);
      console.log(`  PASS  ${model.id}`);
    } else {
      console.log(
        `  ${statusLabel(result).padEnd(13)} ${model.id}${result.detail ? ` — ${result.detail}` : ""}`,
      );
    }
  }

  for (const [label, count] of counts) {
    if (label !== "PASS") summary.push(`${spec.id}: ${count} ${label}`);
  }

  passed
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((model, index) => {
      kept.push({
        provider: spec.id,
        modelId: model.id,
        label: model.label ?? model.id,
        context: model.context ?? null,
        sort: spec.sortBase + index,
      });
    });
  console.log(`  ${passed.length}/${tested.length} kept`);
}

if (kept.length === 0) {
  console.error(
    "\nNo models passed the smoke test — refusing to write a migration.",
  );
  process.exit(1);
}

if (missing.length > 0) {
  console.warn(
    `\nWARNING: omitted providers without keys: ${missing.map((s) => s.id).join(", ")}`,
  );
}

// --- migration ------------------------------------------------------------

function nextMigrationNumber() {
  const numbers = readdirSync(MIGRATIONS_DIR)
    .map((file) => /^(\d+)_/.exec(file)?.[1])
    .filter(Boolean)
    .map(Number);
  return String(Math.max(0, ...numbers) + 1).padStart(4, "0");
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const row = (model) =>
  `  (${quote(model.provider)}, ${quote(model.modelId)}, ${quote(model.label)}, ${model.context ?? "NULL"}, 1, ${model.sort})`;

const sql = [
  `-- Generated by scripts/generate-free-models-migration.mjs on ${new Date().toISOString()}`,
  `-- Every model below passed a real chat smoke test (prompt: ${JSON.stringify(prompt)}, max 128 tokens).`,
  missing.length > 0
    ? `-- Providers omitted (no key this run): ${missing.map((s) => s.id).join(", ")}`
    : "-- All in-scope providers were tested.",
  ``,
  `DROP TABLE IF EXISTS \`free_models\`;--> statement-breakpoint`,
  `CREATE TABLE \`free_models\` (`,
  `\t\`provider\` text NOT NULL,`,
  `\t\`model_id\` text NOT NULL,`,
  `\t\`label\` text NOT NULL,`,
  `\t\`context\` integer,`,
  `\t\`free\` integer DEFAULT true NOT NULL,`,
  `\t\`sort\` integer DEFAULT 0 NOT NULL,`,
  `\tPRIMARY KEY(\`provider\`, \`model_id\`)`,
  `);--> statement-breakpoint`,
  `INSERT INTO \`free_models\` (\`provider\`, \`model_id\`, \`label\`, \`context\`, \`free\`, \`sort\`) VALUES`,
  kept.map(row).join(",\n") + ";",
  ``,
].join("\n");

console.log(
  `\nSmoke test: ${kept.length} model(s) passed across ${new Set(kept.map((m) => m.provider)).size} provider(s).`,
);
if (summary.length > 0) console.log(`Failures: ${summary.join("; ")}`);

if (write) {
  const number = nextMigrationNumber();
  const file = join(
    MIGRATIONS_DIR,
    `${number}_drop_and_reseed_free_models.sql`,
  );
  if (existsSync(file)) {
    console.error(`Refusing to overwrite ${file}`);
    process.exit(1);
  }
  writeFileSync(file, sql);
  console.log(`\nWrote ${file}`);
  console.log(
    "Apply it with: cd apps/worker && npx wrangler d1 migrations apply numbat-db --remote",
  );
} else {
  console.log("\nDry run — SQL follows (pass --write to save it):\n");
  console.log(sql);
}

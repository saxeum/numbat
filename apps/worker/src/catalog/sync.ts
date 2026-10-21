// Orchestrates the catalog refresh (KAN-44): list each provider's models,
// probe only what is new, and reconcile the result into `free_models`.
//
// Design notes — see `docs/free-model-discovery-cron.md`:
// - providers are isolated: one failing provider never touches another's rows;
// - models already in the catalog, and rejects remembered in `catalog_probes`,
//   are not re-probed, so a no-change day spends no quota;
// - every write for a provider is one atomic `db.batch` (deletes + chunked
//   inserts), never a global DROP;
// - guardrails refuse an empty or implausibly small listing.

import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { createDb, type Database } from "../db/client";
import { catalogProbes, catalogRuns, freeModels } from "../db/schema";
import type { ProviderId } from "../gateway/providers";
import { discoverModels, type DiscoveredModel } from "./discover";
import {
  isCacheableRejection,
  probeFreeVerdict,
  probeWithRetries,
  type ProbeStatus,
} from "./probe";
import { discoverySpec, discoverySpecs, type DiscoverySpec } from "./providers";
import {
  chunk,
  MAX_PROBES_PER_INSERT,
  MAX_ROWS_PER_INSERT,
  planReconcile,
} from "./reconcile";

export interface ProviderOutcome {
  provider: string;
  status: "ok" | "skipped" | "failed";
  /** Candidate models kept after filtering (chat-capable). */
  listed: number;
  added: number;
  removed: number;
  /** Models probed this run. */
  probed: number;
  /** Models that failed their probe and were not admitted. */
  dropped: number;
  note?: string;
}

export interface RunSummary {
  runId: string;
  trigger: string;
  status: "ok" | "partial" | "skipped" | "failed";
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  providers: ProviderOutcome[];
}

export interface RunOptions {
  trigger?: string;
  /** Run even when `CATALOG_ENABLED` is not `1` (used by the admin trigger). */
  force?: boolean;
  /** Refresh a single provider (manual debugging). */
  provider?: ProviderId;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface CatalogConfig {
  enabled: boolean;
  dryRun: boolean;
  probeLimit: number;
  concurrency: number | null;
  allowShrink: boolean;
  timeoutMs: number;
  /** Days before a remembered rejection is probed again. */
  reprobeDays: number;
}

const DEFAULT_PROBE_LIMIT = 25;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_REPROBE_DAYS = 7;

/** `Env` has no index signature; catalog vars/secrets are read dynamically. */
function envVars(env: Env): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

function intVar(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function readCatalogConfig(env: Env): CatalogConfig {
  const vars = envVars(env);
  return {
    enabled: vars.CATALOG_ENABLED === "1",
    dryRun: vars.CATALOG_DRY_RUN === "1",
    probeLimit: intVar(vars.CATALOG_PROBE_LIMIT, DEFAULT_PROBE_LIMIT),
    concurrency: vars.CATALOG_CONCURRENCY
      ? intVar(vars.CATALOG_CONCURRENCY, 6)
      : null,
    allowShrink: vars.CATALOG_ALLOW_SHRINK === "1",
    timeoutMs: intVar(vars.CATALOG_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    reprobeDays: intVar(vars.CATALOG_REPROBE_DAYS, DEFAULT_REPROBE_DAYS),
  };
}

/** Runs `fn` over `items` with a bounded number of concurrent workers. */
async function mapPool<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, size), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

interface SyncProviderArgs {
  spec: DiscoverySpec;
  apiKey: string | undefined;
  db: Database;
  config: CatalogConfig;
  fetchImpl: typeof fetch;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  probeBudget: number;
}

async function syncProvider(args: SyncProviderArgs): Promise<ProviderOutcome> {
  const { spec, apiKey, db, config } = args;
  const outcome: ProviderOutcome = {
    provider: spec.id,
    status: "skipped",
    listed: 0,
    added: 0,
    removed: 0,
    probed: 0,
    dropped: 0,
  };

  if (!apiKey) {
    outcome.note = "no key";
    return outcome;
  }

  let discovered: DiscoveredModel[];
  try {
    discovered = await discoverModels(
      spec,
      apiKey,
      args.fetchImpl,
      config.timeoutMs,
    );
  } catch (error) {
    // Keep whatever rows this provider already has.
    outcome.status = "failed";
    outcome.note = error instanceof Error ? error.message : "listing failed";
    return outcome;
  }
  outcome.listed = discovered.length;

  const existing = await db
    .select({
      modelId: freeModels.modelId,
      label: freeModels.label,
      context: freeModels.context,
      note: freeModels.note,
      updatedAt: freeModels.updatedAt,
    })
    .from(freeModels)
    .where(eq(freeModels.provider, spec.id));
  const existingById = new Map(existing.map((row) => [row.modelId, row]));

  const cachedProbes = await db
    .select({
      modelId: catalogProbes.modelId,
      status: catalogProbes.status,
      checkedAt: catalogProbes.checkedAt,
    })
    .from(catalogProbes)
    .where(eq(catalogProbes.provider, spec.id));
  const probeCache = new Map(
    cachedProbes.map((row) => [row.modelId, row.checkedAt]),
  );
  const cooldownMs = config.reprobeDays * 24 * 60 * 60 * 1000;
  const nowMs = args.now().getTime();
  const recentlyRejected = (modelId: string): boolean => {
    const checkedAt = probeCache.get(modelId);
    if (checkedAt === undefined) return false;
    const age = nowMs - Date.parse(checkedAt);
    return Number.isFinite(age) && age < cooldownMs;
  };

  // Models that already have a row, or that were definitively rejected within
  // the cooldown, need no decision. Everything else is "fresh".
  const fresh = discovered.filter(
    (model) => !existingById.has(model.id) && !recentlyRejected(model.id),
  );
  const budget = Math.max(0, args.probeBudget);
  const toProbe = fresh.slice(0, budget);
  const unverified = new Set(fresh.slice(budget).map((model) => model.id));

  const verdicts = new Map<string, boolean>();
  const statuses = new Map<string, ProbeStatus>();

  await mapPool(
    toProbe,
    config.concurrency ?? spec.concurrency,
    async (model) => {
      const result = await probeWithRetries(spec, apiKey, model.id, {
        retries: 1,
        sleep: args.sleep,
        timeoutMs: config.timeoutMs,
        fetchImpl: args.fetchImpl,
      });
      verdicts.set(model.id, probeFreeVerdict(result.status) === true);
      statuses.set(model.id, result.status);
    },
  );
  outcome.probed = toProbe.length;

  const admitted = discovered
    .filter((model) => {
      if (existingById.has(model.id)) return true;
      // Budget exhausted: keep only what the provider declares free.
      if (unverified.has(model.id)) return model.free === true;
      return verdicts.get(model.id) === true;
    })
    .map((model) => ({
      ...model,
      note: statuses.has(model.id)
        ? `probe: ${statuses.get(model.id)}`
        : model.note,
    }));

  outcome.dropped =
    fresh.length -
    admitted.filter((model) => !existingById.has(model.id)).length;

  const plan = planReconcile({
    provider: spec.id,
    existing: [...existingById.keys()],
    models: admitted,
    sortBase: spec.sortBase,
    allowShrink: config.allowShrink,
  });

  if (!plan.apply) {
    outcome.note = plan.reason;
    return outcome;
  }

  outcome.added = plan.added.length;
  outcome.removed = plan.removed.length;

  if (config.dryRun) {
    outcome.status = "ok";
    outcome.note = "dry run";
    return outcome;
  }

  const timestamp = args.now().toISOString();
  const values = plan.rows.map((row) => {
    const previous = existingById.get(row.modelId);
    const changed =
      previous === undefined ||
      previous.label !== row.label ||
      previous.context !== row.context ||
      previous.note !== row.note;
    return {
      ...row,
      lastCheckedAt: timestamp,
      updatedAt: changed ? timestamp : (previous?.updatedAt ?? timestamp),
    };
  });

  // Remember definitive rejections so the next run does not spend its probe
  // budget on them again (and can reach the models behind them). The cache is
  // reconciled, not replaced: entries from earlier runs are kept while the
  // model is still listed and still not admitted, and pruned once it is not.
  const listedIds = new Set(discovered.map((model) => model.id));
  const admittedIds = new Set(admitted.map((model) => model.id));
  const rejections = [
    ...cachedProbes
      .filter(
        (row) => listedIds.has(row.modelId) && !admittedIds.has(row.modelId),
      )
      .map((row) => ({ ...row, provider: spec.id })),
    ...toProbe.flatMap((model) => {
      const status = statuses.get(model.id);
      if (status === undefined || !isCacheableRejection(status)) return [];
      return [
        {
          provider: spec.id,
          modelId: model.id,
          status,
          checkedAt: timestamp,
        },
      ];
    }),
  ];

  // D1 requires a non-empty tuple; the list is built dynamically, so assert.
  const statements = [
    db.delete(freeModels).where(eq(freeModels.provider, spec.id)),
    ...chunk(values, MAX_ROWS_PER_INSERT).map((rows) =>
      db.insert(freeModels).values(rows),
    ),
    db.delete(catalogProbes).where(eq(catalogProbes.provider, spec.id)),
    ...chunk(rejections, MAX_PROBES_PER_INSERT).map((rows) =>
      db.insert(catalogProbes).values(rows),
    ),
  ] as unknown as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
  await db.batch(statements);

  outcome.status = "ok";
  return outcome;
}

/**
 * Refreshes the free-model catalog from live provider data. Safe to call from
 * the cron trigger or the admin route; never throws on a provider failure.
 */
export async function runCatalogSync(
  env: Env,
  options: RunOptions = {},
): Promise<RunSummary> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const runId = crypto.randomUUID();
  const trigger = options.trigger ?? "manual";
  const config = readCatalogConfig(env);

  if (!config.enabled && !options.force) {
    return {
      runId,
      trigger,
      status: "skipped",
      startedAt,
      finishedAt: startedAt,
      dryRun: config.dryRun,
      providers: [],
    };
  }

  const db = createDb(env.DB);
  const specs = options.provider
    ? [discoverySpec(options.provider)]
    : discoverySpecs();
  const vars = envVars(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  if (!config.dryRun) {
    await db.insert(catalogRuns).values({
      id: runId,
      startedAt,
      trigger,
      status: "running",
      providers: "[]",
    });
  }

  const providers: ProviderOutcome[] = [];
  let probeBudget = config.probeLimit;
  // A failure that escapes per-provider isolation (e.g. the D1 write itself).
  let failure: string | null = null;

  try {
    for (const spec of specs) {
      const outcome = await syncProvider({
        spec,
        apiKey: vars[spec.keyEnv],
        db,
        config,
        fetchImpl,
        now,
        sleep,
        probeBudget,
      });
      probeBudget -= outcome.probed;
      providers.push(outcome);
      console.log("catalog sync", {
        runId,
        provider: outcome.provider,
        status: outcome.status,
        listed: outcome.listed,
        added: outcome.added,
        removed: outcome.removed,
        probed: outcome.probed,
        dropped: outcome.dropped,
        note: outcome.note,
      });
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    console.error("catalog sync aborted", { runId, trigger, error: failure });
  }

  const finishedAt = now().toISOString();
  const ran = providers.filter((provider) => provider.status !== "skipped");
  const status: RunSummary["status"] =
    failure !== null
      ? "failed"
      : ran.length === 0
        ? "skipped"
        : ran.every((provider) => provider.status === "failed")
          ? "failed"
          : ran.some((provider) => provider.status === "failed")
            ? "partial"
            : "ok";

  if (!config.dryRun) {
    try {
      await db
        .update(catalogRuns)
        .set({
          finishedAt,
          status,
          providers: JSON.stringify(providers),
          error: failure,
        })
        .where(eq(catalogRuns.id, runId));
    } catch (error) {
      // Never mask the original failure with a bookkeeping failure.
      console.error("catalog sync: could not record the run", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failure !== null) {
    throw new Error(`catalog sync failed: ${failure}`);
  }

  return {
    runId,
    trigger,
    status,
    startedAt,
    finishedAt,
    dryRun: config.dryRun,
    providers,
  };
}

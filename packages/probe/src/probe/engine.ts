import type { AdapterContext, ProviderAdapter } from "../domain/provider";
import type { ProbeOutcome } from "../domain/probe";
import { skippedOutcome } from "./outcome";

export const PROBE_CONCURRENCY = 6;
export const PROBE_TIMEOUT_MS = 3 * 60 * 1000;

export interface RunProbeHooks {
  onStart?: (total: number) => Promise<void> | void;
  onResult?: (outcome: ProbeOutcome) => Promise<void> | void;
}

/** Provider-agnostic probe loop: concurrency, classification, progress. */
export async function runProbes(
  adapter: ProviderAdapter,
  ctx: AdapterContext,
  hooks: RunProbeHooks = {},
): Promise<ProbeOutcome[]> {
  const models = await adapter.listModels(ctx);
  await hooks.onStart?.(models.length);

  return mapLimit(
    models,
    adapter.meta.concurrency ?? PROBE_CONCURRENCY,
    async (model) => {
      const outcome = model.capabilities.chat
        ? await adapter.probeChat(ctx, model)
        : skippedOutcome(model);
      await hooks.onResult?.(outcome);
      return outcome;
    },
  );
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) break;
        results[index] = await fn(items[index] as T);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// Free-model catalog discovery (KAN-44). See
// `docs/free-model-discovery-cron.md` for the design.

export {
  discoverySpec,
  discoverySpecs,
  DISCOVERY_ORDER,
  DISCOVERY_SPECS,
  type DiscoverySpec,
  type FreeStrategy,
} from "./providers";
export { discoverModels, parseModels, type DiscoveredModel } from "./discover";
export {
  classifyProbe,
  isCacheableRejection,
  probeFreeVerdict,
  probeModel,
  probeWithRetries,
  type ProbeOutcome,
  type ProbeStatus,
} from "./probe";
export {
  chunk,
  planReconcile,
  FREE_MODEL_COLUMNS,
  MAX_BOUND_PARAMS,
  MAX_PROBES_PER_INSERT,
  MAX_ROWS_PER_INSERT,
  MIN_KEEP_RATIO,
  PROBE_COLUMNS,
  type CatalogRow,
  type ReconcilePlan,
  type ReconcileSkip,
} from "./reconcile";
export {
  readCatalogConfig,
  runCatalogSync,
  type CatalogConfig,
  type ProviderOutcome,
  type RunOptions,
  type RunSummary,
} from "./sync";

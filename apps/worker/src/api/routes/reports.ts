import { CreateReportRequest, UpdateReportRequest } from "@numbat/api";
import { Hono } from "hono";

import { createDb } from "../../db/client";
import { getCredentialMetaById } from "../../db/queries/credentials";
import {
  countProbeRunsSince,
  createProbeRun,
  deleteProbeRun,
  findActiveProbeRun,
  getProbeRun,
  listProbeRunModels,
  listProbeRuns,
  updateProbeRunLabel,
  type ProbeRunModelRow,
  type ProbeRunRow,
} from "../../db/queries/reports";
import { reportRateLimitPerHour } from "../../reports/limits";
import { requireSession } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { validate } from "../openapi";
import type { AppEnv } from "../types";

// Reports are a dashboard action on a stored credential — session-only, like
// credential and API-key management. Inference routes keep accepting API keys.
export const reports = new Hono<AppEnv>();

reports.use("*", requireSession);

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const EMPTY_TOTALS = {
  models: 0,
  chat: 0,
  skipped: 0,
  passed: 0,
  failed: 0,
  withinQuota: 0,
  exhausted: 0,
  unavailable: 0,
  thinking: 0,
};

function parseJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function serializeRun(row: ProbeRunRow) {
  const totals =
    (parseJson(row.totalsJson) as Record<string, number> | undefined) ??
    EMPTY_TOTALS;
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    trigger: row.trigger,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.durationMs,
    progressDone: row.progressDone,
    progressTotal: row.progressTotal,
    totals: { ...EMPTY_TOTALS, ...totals },
    error: row.error,
  };
}

function serializeModel(row: ProbeRunModelRow) {
  const limits = parseJson(row.quotaLimitsJson);
  const headers = parseJson(row.headersJson);
  return {
    id: row.id,
    modelId: row.modelId,
    resolvedModel: row.resolvedModel,
    kind: row.kind,
    attempted: row.attempted,
    ok: row.ok,
    status: row.status,
    statusText: row.statusText,
    durationMs: row.durationMs,
    ttftMs: row.ttftMs,
    completionTokens: row.completionTokens,
    reasoningTokens: row.reasoningTokens,
    tps: row.tps,
    thinking: row.thinking,
    content: row.content,
    error:
      row.errorName || row.errorMessage
        ? { name: row.errorName, message: row.errorMessage }
        : null,
    quota: {
      state: row.quotaState ?? "unknown",
      retryAfterMs: row.quotaRetryAfterMs,
      limits: Array.isArray(limits) ? limits : [],
    },
    requestBody: row.requestBody,
    body: row.body,
    headers: headers ?? null,
  };
}

reports.get("/", async (c) => {
  const requested = Number.parseInt(c.req.query("limit") ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rows = await listProbeRuns(createDb(c.env.DB), c.get("userId"), limit);
  return c.json({ reports: rows.map(serializeRun) }, 200);
});

reports.post("/", validate("json", CreateReportRequest), async (c) => {
  const { credentialId, label } = c.req.valid("json");
  const ownerId = c.get("userId");
  const db = createDb(c.env.DB);

  const credential = await getCredentialMetaById(db, ownerId, credentialId);
  if (!credential) {
    throw new AppError(
      404,
      "CREDENTIAL_NOT_FOUND",
      `Credential ${credentialId} not found`,
    );
  }

  const active = await findActiveProbeRun(db, ownerId);
  if (active) {
    throw new AppError(
      409,
      "RUN_IN_PROGRESS",
      "A report is already running; wait for it to finish",
    );
  }

  // Per-user cap so a user can't churn through expensive provider quota.
  const perHour = reportRateLimitPerHour(c.env);
  const sinceIso = new Date(Date.now() - 3_600_000).toISOString();
  if ((await countProbeRunsSince(db, ownerId, sinceIso)) >= perHour) {
    throw new AppError(
      429,
      "RATE_LIMITED",
      `Report limit reached (${perHour} per hour); try again later`,
    );
  }

  if (!c.env.PROBE_QUEUE) {
    throw new AppError(
      500,
      "SERVER_MISCONFIGURED",
      "PROBE_QUEUE binding is not configured",
    );
  }

  const id = crypto.randomUUID();
  await createProbeRun(db, {
    id,
    ownerId,
    credentialId,
    provider: credential.provider,
    label: label ?? null,
    createdAt: new Date().toISOString(),
  });

  const run = await getProbeRun(db, ownerId, id);
  await c.env.PROBE_QUEUE.send({ runId: id });

  return c.json({ report: serializeRun(run!) }, 202);
});

reports.get("/:id", async (c) => {
  const ownerId = c.get("userId");
  const db = createDb(c.env.DB);
  const run = await getProbeRun(db, ownerId, c.req.param("id"));
  if (!run) {
    throw new AppError(404, "REPORT_NOT_FOUND", "Report not found");
  }
  const models = await listProbeRunModels(db, run.id);
  return c.json(
    { report: { ...serializeRun(run), models: models.map(serializeModel) } },
    200,
  );
});

reports.patch("/:id", validate("json", UpdateReportRequest), async (c) => {
  const { label } = c.req.valid("json");
  const db = createDb(c.env.DB);
  const ownerId = c.get("userId");
  const id = c.req.param("id");

  const updated = await updateProbeRunLabel(db, ownerId, id, label ?? null);
  if (!updated) {
    throw new AppError(404, "REPORT_NOT_FOUND", "Report not found");
  }
  const run = await getProbeRun(db, ownerId, id);
  return c.json({ report: serializeRun(run!) }, 200);
});

reports.delete("/:id", async (c) => {
  const deleted = await deleteProbeRun(
    createDb(c.env.DB),
    c.get("userId"),
    c.req.param("id"),
  );
  if (!deleted) {
    throw new AppError(404, "REPORT_NOT_FOUND", "Report not found");
  }
  return c.body(null, 204);
});

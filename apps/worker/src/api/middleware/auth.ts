import { createMiddleware } from "hono/factory";

import { createAuth } from "../../auth";
import { createDb } from "../../db/client";
import { findActiveApiKeyByHash, touchApiKey } from "../../db/queries/api-keys";
import { API_KEY_PREFIX, hashApiKey } from "../../gateway/api-keys";
import type { AppEnv } from "../types";
import { AppError } from "./error";

/** Requires a valid session cookie; attaches `user`, `session` and `userId`. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in required");
  }

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("userId", session.user.id);

  await next();
});

/**
 * Requires a session for browser-facing pages (e.g. the Swagger UI). Browser
 * navigations are redirected to the app's sign-in route; API callers get the
 * standard 401 envelope.
 */
export const requireSessionPage = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    if ((c.req.header("accept") ?? "").includes("text/html")) {
      return c.redirect("/gateway");
    }
    throw new AppError(401, "UNAUTHENTICATED", "Sign in required");
  }

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("userId", session.user.id);

  await next();
});

/**
 * Accepts a session cookie **or** a gateway API key (`Authorization: Bearer
 * nbk_…`) and sets `userId`. Used on the inference routes (models, chat).
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header.trim())?.[1];

  if (token && token.startsWith(API_KEY_PREFIX)) {
    const db = createDb(c.env.DB);
    const key = await findActiveApiKeyByHash(db, await hashApiKey(token));
    if (!key) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid or revoked API key");
    }
    c.set("userId", key.ownerId);
    await touchApiKey(db, key.id, new Date().toISOString());
    await next();
    return;
  }

  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in required");
  }

  c.set("user", session.user);
  c.set("session", session.session);
  c.set("userId", session.user.id);

  await next();
});

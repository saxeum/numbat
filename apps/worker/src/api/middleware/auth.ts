import { createMiddleware } from "hono/factory";

import { createAuth } from "../../auth";
import type { AppEnv } from "../types";
import { AppError } from "./error";

/** Requires a valid session; attaches `user` + `session` to the context. */
export const requireSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new AppError(401, "UNAUTHENTICATED", "Sign in required");
  }

  c.set("user", session.user);
  c.set("session", session.session);

  await next();
});

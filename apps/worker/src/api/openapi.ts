import type { Hook } from "@hono/zod-openapi";

import { AppError } from "./middleware/error";
import type { AppEnv } from "./types";

/**
 * Routes validation failures through the standard error envelope (400) instead
 * of @hono/zod-openapi's default payload.
 */
export const defaultHook: Hook<unknown, AppEnv, string, void> = (result) => {
  if (!result.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Invalid request",
      result.error.issues,
    );
  }
};

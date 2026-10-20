import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";

import { AppError } from "./middleware/error";

/**
 * Validates a request target against a generated Zod schema (from
 * `@numbat/api`), routing failures through the standard error envelope.
 */
export const validate = <
  T extends ZodType,
  TTarget extends keyof ValidationTargets,
>(
  target: TTarget,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Invalid request",
        result.error.issues,
      );
    }
  });

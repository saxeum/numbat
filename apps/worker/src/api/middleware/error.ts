import type { Context, ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import type { ErrorResponse } from "@numbat/api";

import type { AppEnv } from "../types";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const envelope = (
  code: string,
  message: string,
  requestId: string | undefined,
  details?: unknown,
): ErrorResponse => ({
  error: {
    code,
    message,
    requestId,
    ...(details === undefined ? {} : { details }),
  },
});

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          type: "app-error",
          requestId,
          code: err.code,
          message: err.message,
          stack: err.stack,
        }),
      );
    }
    return c.json(
      envelope(err.code, err.message, requestId, err.details),
      err.status as 400,
    );
  }

  if (err instanceof HTTPException) {
    return c.json(envelope("HTTP_ERROR", err.message, requestId), err.status);
  }

  console.error(
    JSON.stringify({
      level: "error",
      type: "unhandled-error",
      requestId,
      message: err.message,
      stack: err.stack,
    }),
  );

  return c.json(
    envelope("INTERNAL_ERROR", "An unexpected error occurred", requestId),
    500,
  );
};

export const notFoundHandler = (c: Context<AppEnv>) =>
  c.json(
    envelope(
      "NOT_FOUND",
      `Route not found: ${c.req.method} ${c.req.path}`,
      c.get("requestId"),
    ),
    404,
  );

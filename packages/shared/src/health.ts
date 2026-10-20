import { z } from "zod";

export const HealthResponse = z.object({
  ok: z.boolean(),
  timestamp: z.string(),
  version: z.string(),
  database: z.string().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

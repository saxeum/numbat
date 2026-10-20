import { z } from "zod";

export const EnvSchema = z.object({
  ENVIRONMENT: z.enum(["development", "staging", "production"]),
});

let validated = false;

/**
 * Validates the Worker environment once per isolate. Throws on invalid config so
 * misconfiguration fails fast instead of surfacing as confusing runtime errors.
 */
export function validateEnv(env: Env): void {
  if (validated) return;

  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment configuration", result.error.flatten());
    throw new Error("Invalid environment configuration");
  }

  validated = true;
}

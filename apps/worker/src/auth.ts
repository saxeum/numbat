import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./db/schema";

/**
 * Better Auth instance bound to the request's D1 database. Built per request
 * (Workers bindings aren't available at module scope). See docs/auth-plan.md.
 */
export function createAuth(env: Env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: "sqlite",
      schema,
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Password sign-in is enabled outside production only, so dev/E2E can sign
    // in deterministically (Google OAuth can't be automated headlessly).
    emailAndPassword: { enabled: env.ENVIRONMENT !== "production" },
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;

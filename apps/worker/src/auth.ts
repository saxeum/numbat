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
    // Password sign-in is enabled in development only, so dev/E2E can sign in
    // deterministically (Google OAuth can't be automated headlessly). Staging
    // and preview are publicly reachable, so they must not allow sign-up.
    emailAndPassword: { enabled: env.ENVIRONMENT === "development" },
    trustedOrigins: [env.BETTER_AUTH_URL],
  });
}

export type Auth = ReturnType<typeof createAuth>;

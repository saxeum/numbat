// Codegen-only config for `@better-auth/cli generate` (emits the Drizzle schema
// for the auth tables). The runtime auth instance is `createAuth(env)` in
// `src/auth.ts` — it uses the D1 binding, not this file.
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const sqlite = new Database(":memory:");

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(sqlite), { provider: "sqlite" }),
  secret: "codegen-only-not-a-real-secret",
  socialProviders: { google: { clientId: "codegen", clientSecret: "codegen" } },
  emailAndPassword: { enabled: true },
});

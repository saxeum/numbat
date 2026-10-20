import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          // Test-only auth config: dev env enables email/password sign-in so
          // tests can authenticate deterministically (Google can't be automated).
          ENVIRONMENT: "development",
          BETTER_AUTH_URL: "http://localhost:5173",
          BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
          GOOGLE_CLIENT_ID: "test-client-id",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

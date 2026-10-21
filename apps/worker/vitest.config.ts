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
          // Test KEK: 32 zero bytes (base64). Production sets a real secret.
          BYOK_KEK: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          BYOK_KEK_VERSION: "1",
          // Catalog sync (KAN-44): the admin token is set, the ops keys are
          // deliberately absent so no test reaches a real provider.
          CATALOG_ADMIN_TOKEN: "test-catalog-token",
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
  },
});

# apps/worker — API Worker

Hono REST API, mounted at `/api` on `foonix.net` (route `foonix.net/api/*`).

```txt
npm run dev        # wrangler dev on :8787
npm run types      # regenerate worker-configuration.d.ts
npm run typecheck
npm run deploy
```

Health check: `GET /api/health` → `{ "ok": true }`.

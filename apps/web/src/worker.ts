// Web Worker entry: serve the SPA from static assets, but proxy `/api/*` to the
// API Worker. In production the zone route sends `/api/*` to the API Worker
// directly, so this only matters on `*.workers.dev` (notably PR previews) where
// there is no zone route — letting the preview SPA talk to the (isolated) API
// preview. See docs/workflow-plan.md W3 and KAN-14.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return env.API.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

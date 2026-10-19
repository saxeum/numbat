import { Hono } from "hono";

import { health } from "./api/routes/health";

const app = new Hono<{ Bindings: Env }>();

const api = new Hono<{ Bindings: Env }>();
api.route("/health", health);

app.route("/api", api);

export default app;

import { Hono } from "hono";
import type { Computed } from "../types.js";

/** Read-only public API. Versioned under /v1; breaking changes need /v2. */
export function createApp(now: () => Date = () => new Date()) {
  const app = new Hono();

  app.get("/v1/health", (c) => {
    const body: Computed & { status: "ok" } = {
      status: "ok",
      ledger: null,
      computed_at: now().toISOString(),
    };
    return c.json(body);
  });

  return app;
}

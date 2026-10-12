import { Hono } from "hono";
import type { AssetEntry, Computed, ReportStatus, Snapshot } from "../types.js";

const STATUSES = new Set<ReportStatus>([
  "NO_REPORT_LINK",
  "LINK_BROKEN",
  "UNSTRUCTURED_REPORT",
  "STRUCTURED_REPORT",
]);

/**
 * Read-only public API. Versioned under /v1; breaking changes need /v2.
 * Every response carries the snapshot it came from, its ledger and time.
 */
export function createApp(
  getSnapshot: () => Snapshot | null = () => null,
  now: () => Date = () => new Date(),
) {
  const app = new Hono();

  const meta = (s: Snapshot) => ({
    snapshot: s.id,
    ledger: s.ledger,
    computed_at: s.computed_at,
    disclaimer: "Figures as stated by issuers or attestors. Not an audit, not investment advice.",
  });
  const noData = { error: "no_snapshot", message: "No census snapshot has been published yet." };

  app.get("/v1/health", (c) => {
    const s = getSnapshot();
    const body: Computed & { status: "ok"; snapshot: string | null } = {
      status: "ok",
      snapshot: s?.id ?? null,
      ledger: s?.ledger ?? null,
      computed_at: s?.computed_at ?? now().toISOString(),
    };
    return c.json(body);
  });

  app.get("/v1/summary", (c) => {
    const s = getSnapshot();
    if (!s) return c.json(noData, 503);
    return c.json({
      ...meta(s),
      ledger_start: s.ledger_start,
      ledger_end: s.ledger_end,
      summary: s.summary,
    });
  });

  app.get("/v1/assets", (c) => {
    const s = getSnapshot();
    if (!s) return c.json(noData, 503);
    const q = c.req.query();
    let list: AssetEntry[] = s.assets;
    if (q.anchored === "true") list = list.filter((a) => a.sep1.is_asset_anchored === true);
    if (q.status) {
      if (!STATUSES.has(q.status as ReportStatus)) return c.json({ error: "bad_status" }, 400);
      list = list.filter((a) => a.status === q.status);
    }
    if (q.type) list = list.filter((a) => a.sep1.anchor_asset_type === q.type);
    const limit = Math.min(Math.max(Number(q.limit ?? 100) || 100, 1), 500);
    const offset = Math.max(Number(q.offset ?? 0) || 0, 0);
    return c.json({
      ...meta(s),
      total: list.length,
      offset,
      limit,
      assets: list.slice(offset, offset + limit),
    });
  });

  app.get("/v1/assets/:id", (c) => {
    const s = getSnapshot();
    if (!s) return c.json(noData, 503);
    const asset = s.assets.find((a) => a.id === c.req.param("id"));
    if (!asset) return c.json({ ...meta(s), error: "not_found" }, 404);
    return c.json({ ...meta(s), asset });
  });

  return app;
}

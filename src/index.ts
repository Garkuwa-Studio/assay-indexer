import { serve } from "@hono/node-server";
import { createApp } from "./api/app.js";
import { loadLatestSnapshot } from "./api/store.js";

const port = Number(process.env.PORT ?? 8787);
const dir = process.env.SNAPSHOT_DIR ?? "data/snapshots";

// Snapshots change once per run; reload at most once a minute.
let cached = loadLatestSnapshot(dir);
let loadedAt = Date.now();
const getSnapshot = () => {
  if (Date.now() - loadedAt > 60_000) {
    cached = loadLatestSnapshot(dir);
    loadedAt = Date.now();
  }
  return cached;
};

serve({ fetch: createApp(getSnapshot).fetch, port }, (info) => {
  console.log(`assay-indexer listening on :${info.port} (snapshot: ${cached?.id ?? "none"})`);
});

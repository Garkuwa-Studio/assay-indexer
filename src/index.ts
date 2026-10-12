import { serve } from "@hono/node-server";
import { createApp } from "./api/app.js";

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`assay-indexer listening on :${info.port}`);
});

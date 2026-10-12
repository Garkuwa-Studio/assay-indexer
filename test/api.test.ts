import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.js";
import { fixtureSnapshot } from "./fixture-run.js";
import { ISSUER } from "./helpers.js";

describe("API v1", async () => {
  const { snap } = await fixtureSnapshot();
  const app = createApp(() => snap);

  it("health reports the snapshot", async () => {
    const r = await app.request("/v1/health");
    expect(await r.json()).toMatchObject({ status: "ok", snapshot: snap.id, ledger: snap.ledger });
  });
  it("summary carries ledger, time and disclaimer", async () => {
    const b = (await (await app.request("/v1/summary")).json()) as Record<string, unknown>;
    expect(b).toMatchObject({
      snapshot: snap.id,
      ledger: snap.ledger,
      computed_at: snap.computed_at,
    });
    expect(String(b.disclaimer)).toContain("Not an audit");
  });
  it("lists and filters assets", async () => {
    const all = (await (await app.request("/v1/assets")).json()) as { total: number };
    expect(all.total).toBe(3);
    const broken = (await (await app.request("/v1/assets?status=LINK_BROKEN")).json()) as {
      assets: { code: string }[];
    };
    expect(broken.assets.map((a) => a.code)).toEqual(["GOLD"]);
    expect((await app.request("/v1/assets?status=BEST")).status).toBe(400);
  });
  it("returns one asset by CODE-ISSUER and marks manual figures", async () => {
    const b = (await (await app.request(`/v1/assets/BOND-${ISSUER}`)).json()) as {
      asset: { manually_transcribed: boolean };
    };
    expect(b.asset.manually_transcribed).toBe(true);
    expect((await app.request(`/v1/assets/NOPE-${ISSUER}`)).status).toBe(404);
  });
  it("answers 503 before any snapshot exists", async () => {
    const empty = createApp(() => null);
    expect((await empty.request("/v1/summary")).status).toBe(503);
    expect((await (await empty.request("/v1/health")).json()) as object).toMatchObject({
      snapshot: null,
      ledger: null,
    });
  });
});

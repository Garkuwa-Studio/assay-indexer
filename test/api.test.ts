import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.js";

describe("GET /v1/health", () => {
  it("returns status with computed_at and a null ledger", async () => {
    const app = createApp(() => new Date("2026-01-01T00:00:00Z"));
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      ledger: null,
      computed_at: "2026-01-01T00:00:00.000Z",
    });
  });
});

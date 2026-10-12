import { describe, expect, it } from "vitest";
import { fetchToml, findCurrency, sep1Fields } from "../src/toml/index.js";
import { errors, fixture, fixtureFetcher, ISSUER } from "./helpers.js";

const T = "https://example.org/.well-known/stellar.toml";

describe("fetchToml", () => {
  it("parses a stellar.toml", async () => {
    const t = await fetchToml(
      fixtureFetcher({ [T]: { body: fixture("stellar.toml").toString() } }),
      T,
    );
    expect(t.error_kind).toBeNull();
    expect(Array.isArray(t.data?.CURRENCIES)).toBe(true);
  });
  it("records an HTML page served as stellar.toml as not_toml", async () => {
    const t = await fetchToml(
      fixtureFetcher({ [T]: { body: fixture("not-toml.html").toString() } }),
      T,
    );
    expect(t.http_status).toBe(200);
    expect(t.error_kind).toBe("not_toml");
    expect(t.data).toBeNull();
  });
  it("records 404 and DNS failures", async () => {
    expect(
      (await fetchToml(fixtureFetcher({ [T]: { status: 404, body: "" } }), T)).error_kind,
    ).toBe("http_4xx");
    expect((await fetchToml(fixtureFetcher({ [T]: { throws: errors.dns() } }), T)).error_kind).toBe(
      "dns",
    );
  });
});

describe("findCurrency", () => {
  const f = fixtureFetcher({
    [T]: { body: fixture("stellar.toml").toString() },
    "https://example.org/.well-known/GOLD.toml": { body: fixture("GOLD.toml").toString() },
  });
  it("matches code AND issuer", async () => {
    const t = await fetchToml(f, T);
    const m = await findCurrency(t.data!, "USDX", ISSUER, async () => null);
    expect(m?.via).toBe("stellar.toml");
    expect(await findCurrency(t.data!, "USDX", "GOTHER", async () => null)).toBeNull();
  });
  it("follows toml = links to currency files", async () => {
    const t = await fetchToml(f, T);
    const m = await findCurrency(
      t.data!,
      "GOLD",
      ISSUER,
      async (u) => (await fetchToml(f, u)).data,
    );
    expect(m?.via).toBe("https://example.org/.well-known/GOLD.toml");
    expect(sep1Fields(m!.currency).anchor_asset_type).toBe("commodity");
  });
  it("normalises missing and empty fields to null", () => {
    const s = sep1Fields({ code: "X", attestation_of_reserve: "  " });
    expect(s.attestation_of_reserve).toBeNull();
    expect(s.is_asset_anchored).toBeNull();
    expect(s.collateral_addresses).toEqual([]);
  });
});

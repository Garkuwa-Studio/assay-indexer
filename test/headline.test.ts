import { describe, expect, it } from "vitest";
import { fetchHolders } from "../src/holders/index.js";
import { boardFile, enrichSnapshot, inHeadline } from "../src/snapshot.js";
import { headline } from "../src/status.js";
import type { AssetEntry, Snapshot } from "../src/types.js";
import { fixtureSnapshot } from "./fixture-run.js";
import { fixtureFetcher, ISSUER } from "./helpers.js";

describe("headline rule", () => {
  it("needs 50 funded holders; 49 is not enough", () => {
    expect(headline(50, false)).toBe("holders");
    expect(headline(49, false)).toBeNull();
    expect(headline(null, false)).toBeNull();
  });
  it("always includes an asset that publishes a reserve link", () => {
    expect(headline(0, true)).toBe("reserve_link");
    expect(headline(null, true)).toBe("reserve_link");
    expect(headline(500, true)).toBe("holders_and_reserve_link");
  });
});

const E = "https://expert.test/explorer/public";
const rec = (code: string, total: number, funded: number) => ({
  asset: `${code}-${ISSUER}-1`,
  trustlines: { total, authorized: total, funded },
});

describe("fetchHolders", () => {
  it("pages by trustlines and stops once totals fall below the floor", async () => {
    const f = fixtureFetcher({
      [`${E}/asset?sort=trustlines&order=desc&limit=2`]: {
        body: {
          _embedded: {
            records: [
              { asset: "XLM", trustlines: { total: 9000, funded: 9000 } },
              rec("AAA", 900, 400),
            ],
          },
          _links: {
            next: { href: "/explorer/public/asset?sort=trustlines&order=desc&limit=2&cursor=2" },
          },
        },
      },
      [`${E}/asset?sort=trustlines&order=desc&limit=2&cursor=2`]: {
        body: {
          _embedded: { records: [rec("BBB", 60, 3), rec("CCC", 49, 49)] },
          _links: {
            next: { href: "/explorer/public/asset?sort=trustlines&order=desc&limit=2&cursor=4" },
          },
        },
      },
      [`${E}/asset?sort=trustlines&order=desc&limit=2&cursor=4`]: {
        body: {
          _embedded: { records: [rec("DDD", 40, 4), rec("EEE", 10, 1)] },
          _links: {
            next: { href: "/explorer/public/asset?sort=trustlines&order=desc&limit=2&cursor=6" },
          },
        },
      },
    });
    const h = await fetchHolders(f, 50, { base: E, pageSize: 2 });
    expect(f.calls).toHaveLength(3); // page 3 is all below the floor, so no cursor=6
    expect(h.get(`AAA-${ISSUER}`)).toEqual({ total: 900, funded: 400 });
    expect(h.get(`BBB-${ISSUER}`)).toEqual({ total: 60, funded: 3 });
    expect(h.has(`CCC-${ISSUER}`)).toBe(false); // below the floor
    expect(h.has("XLM")).toBe(false);
  });
});

describe("enrichSnapshot and boardFile", () => {
  it("adds holders, recomputes the summary and filters the board file", async () => {
    const { snap } = await fixtureSnapshot();
    // Add a declared-anchored asset with no reserve link to test the holders branch.
    const base = snap.assets.find((a) => a.code === "BOND")!;
    const noLink = (code: string): AssetEntry => ({
      ...base,
      id: `${code}-${ISSUER}`,
      code,
      sep1: { ...base.sep1, attestation_of_reserve: null },
      status: "NO_REPORT_LINK",
      report_link: null,
      headline: null,
    });
    const s: Snapshot = {
      ...snap,
      assets: [...snap.assets, noLink("POPULAR"), noLink("LOOKALIKE")],
    };
    const holders = new Map([
      [`POPULAR-${ISSUER}`, { total: 120, funded: 80 }],
      [`LOOKALIKE-${ISSUER}`, { total: 60, funded: 2 }],
    ]);
    const e = enrichSnapshot(s, holders, {
      url: "x",
      fetched_at: "2026-10-12T00:00:00Z",
      min_total: 50,
    });

    const by = Object.fromEntries(e.assets.map((a) => [a.code, a]));
    expect(by.POPULAR!.headline).toBe("holders");
    expect(by.LOOKALIKE!.headline).toBeNull();
    expect(by.USDX!.headline).toBe("reserve_link");
    expect(e.summary).toMatchObject({ self_declared_anchored: 5, assets_checked: 3 }); // GOLD: off-domain link
    expect(e.summary.by_status.NO_REPORT_LINK).toBe(1);
    expect(e.run.holders_source).toMatchObject({ assets: 2, min_total: 50 });

    const b = boardFile(e);
    expect(b.assets.map((a) => a.code).sort()).toEqual(["BOND", "POPULAR", "USDX"]);
    expect(b.assets.every(inHeadline)).toBe(true);
  });
});

describe("fetchHolders with an out-of-order list", () => {
  it("keeps paging while any entry on the page is at or above the floor", async () => {
    const page = (cursor: number, records: object[], next: boolean) => ({
      body: {
        _embedded: { records },
        _links: next
          ? {
              next: {
                href: `/explorer/public/asset?sort=trustlines&order=desc&limit=2&cursor=${cursor + 2}`,
              },
            }
          : {},
      },
    });
    const url = (c: number) =>
      `${E}/asset?sort=trustlines&order=desc&limit=2${c ? `&cursor=${c}` : ""}`;
    const f = fixtureFetcher({
      [url(0)]: page(0, [rec("AAA", 900, 400), rec("LOW", 10, 1)], true), // out of order
      [url(2)]: page(2, [rec("BBB", 70, 60), rec("CCC", 20, 5)], true),
      [url(4)]: page(4, [rec("DDD", 30, 2), rec("EEE", 12, 1)], true), // all below → stop
    });
    const h = await fetchHolders(f, 50, { base: E, pageSize: 2 });
    expect(f.calls).toHaveLength(3);
    expect([...h.keys()].map((k) => k.split("-")[0]).sort()).toEqual(["AAA", "BBB"]);
  });
});

describe("linkOnIssuerDomain", async () => {
  const { linkOnIssuerDomain } = await import("../src/status.js");
  it("accepts a subdomain of the issuer's registrable domain", () => {
    expect(
      linkOnIssuerDomain("https://app.etherfuse.com/legal/proof-of-reserves", "etherfuse.com"),
    ).toBe(true);
    expect(linkOnIssuerDomain("https://www.audd.digital/x", "audd.digital")).toBe(true);
  });
  it("rejects another company's page (copied link, seen on mainnet)", () => {
    expect(linkOnIssuerDomain("https://www.centre.io/usdc-transparency", "aplhabetpay.org")).toBe(
      false,
    );
    expect(linkOnIssuerDomain("https://ntokens.onlypay.com.br/r", "ntokens.com")).toBe(false);
  });
  it("treats each pages.dev site as its own domain", () => {
    expect(
      linkOnIssuerDomain("https://stellar.expert/explorer/public/asset/X", "iccol.pages.dev"),
    ).toBe(false);
    expect(linkOnIssuerDomain("https://other.pages.dev/r", "iccol.pages.dev")).toBe(false);
  });
  it("is null without a link or with an unparseable one", () => {
    expect(linkOnIssuerDomain(null, "example.org")).toBeNull();
    expect(linkOnIssuerDomain("not a url", "example.org")).toBeNull();
  });
});

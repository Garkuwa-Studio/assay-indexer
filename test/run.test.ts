import { describe, expect, it } from "vitest";
import { fixtureSnapshot, ORG } from "./fixture-run.js";

describe("runCensus (fixtures only)", () => {
  it("builds a snapshot with neutral statuses and the board summary", async () => {
    const { snap, calls } = await fixtureSnapshot();
    expect(calls.filter((c) => c === ORG)).toHaveLength(1); // one fetch per stellar.toml
    expect(snap.ledger_start).toBe(64905000);
    expect(snap.assets.map((a) => a.code)).toEqual(["BOND", "GOLD", "USDX"]); // anchored only; MEME not anchored

    const by = Object.fromEntries(snap.assets.map((a) => [a.code, a]));
    expect(by.USDX).toMatchObject({
      status: "STRUCTURED_REPORT",
      report_date_source: "structured",
      report_age_days: 11, // 2026-09-30T23:59:59Z → 2026-10-12T12:00Z
      coverage_as_stated: 1.01,
      manually_transcribed: false,
      supply: null,
    });
    expect(by.BOND).toMatchObject({
      status: "UNSTRUCTURED_REPORT",
      report_kind: "pdf",
      report_date_source: "manual",
      coverage_as_stated: 1.25,
      manually_transcribed: true,
    });
    expect(by.GOLD!.status).toBe("LINK_BROKEN");
    expect(by.GOLD!.reserve_link_on_issuer_domain).toBe(false);
    expect(by.GOLD!.headline).toBeNull();
    expect(by.USDX!.reserve_link_on_issuer_domain).toBe(true);
    expect(by.GOLD!.report_link?.error_kind).toBe("blocked_403");
    expect(by.GOLD!.toml.currency_via).toBe("https://example.org/.well-known/GOLD.toml");

    expect(snap.summary).toMatchObject({
      assets_with_toml_link: 5,
      assets_listed: 4,
      assets_invalid_home_domain: 1,
      self_declared_anchored: 3,
      // GOLD links to blocked.example, not its issuer's domain, and has no
      // holder data, so it is outside the headline set.
      assets_checked: 2,
      with_report_link: 2,
      with_working_link: 2,
      with_recent_report: 2,
      by_status: {
        NO_REPORT_LINK: 0,
        LINK_BROKEN: 0,
        UNSTRUCTURED_REPORT: 1,
        STRUCTURED_REPORT: 1,
      },
    });
  });
});

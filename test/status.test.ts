import { describe, expect, it } from "vitest";
import { coverageAsStated, isRecent, reportDate, reportStatus } from "../src/status.js";
import type { LinkCheck, StatedFigures } from "../src/types.js";

const okLink = { error_kind: null } as LinkCheck;
const badLink = { error_kind: "blocked_403" } as LinkCheck;

describe("reportStatus", () => {
  it("maps to the four neutral statuses", () => {
    expect(reportStatus({ attestation_of_reserve: null, link: null, structured: false })).toBe(
      "NO_REPORT_LINK",
    );
    expect(reportStatus({ attestation_of_reserve: "u", link: badLink, structured: false })).toBe(
      "LINK_BROKEN",
    );
    expect(reportStatus({ attestation_of_reserve: "u", link: null, structured: false })).toBe(
      "LINK_BROKEN",
    );
    expect(reportStatus({ attestation_of_reserve: "u", link: okLink, structured: false })).toBe(
      "UNSTRUCTURED_REPORT",
    );
    expect(reportStatus({ attestation_of_reserve: "u", link: okLink, structured: true })).toBe(
      "STRUCTURED_REPORT",
    );
  });
});

const stated = (o: Partial<StatedFigures> = {}): StatedFigures => ({
  reserves: [{ type: null, amount: "100", unit: "USD" }],
  liabilities: { supply: "100", unit: "USD" },
  as_of: "2026-09-07T00:00:00Z",
  attestor: null,
  source: "structured",
  ...o,
});

describe("reportDate", () => {
  const now = new Date("2026-10-12T00:00:00Z");
  it("ages a structured or manual date", () => {
    expect(reportDate(stated(), null, now)).toEqual({
      date: "2026-09-07T00:00:00Z",
      source: "structured",
      age_days: 35,
    });
  });
  it("never derives age from a PDF file date", () => {
    expect(reportDate(null, "2026-10-01T00:00:00Z", now)).toEqual({
      date: "2026-10-01T00:00:00Z",
      source: "pdf_metadata",
      age_days: null,
    });
  });
  it("returns unknown when nothing is stated", () => {
    expect(reportDate(null, null, now)).toEqual({ date: null, source: null, age_days: null });
  });
  it("counts under 35 days as recent; exactly 35 is not", () => {
    expect(isRecent(34)).toBe(true);
    expect(isRecent(35)).toBe(false);
    expect(isRecent(null)).toBe(false);
  });
});

describe("coverageAsStated", () => {
  const fiat = { code: "USDX", anchor_asset_type: "fiat", anchor_asset: "USD" };
  it("is exactly 1 at 100%", () => {
    expect(coverageAsStated(stated(), fiat)).toEqual({
      value: 1,
      basis: "reserves and liabilities both in USD",
    });
  });
  it("sums reserves and handles above and below", () => {
    const s = stated({
      reserves: [
        { type: null, amount: "60.5", unit: "USD" },
        { type: null, amount: "40", unit: "USD" },
      ],
    });
    expect(coverageAsStated(s, fiat).value).toBe(1.005);
    expect(
      coverageAsStated(stated({ reserves: [{ type: null, amount: "92", unit: "USD" }] }), fiat)
        .value,
    ).toBe(0.92);
  });
  it("uses the stated fiat anchor when liabilities are in the token", () => {
    const s = stated({
      liabilities: { supply: "1000000.00", unit: "USDX" },
      reserves: [{ type: null, amount: "1010000.00", unit: "USD" }],
    });
    const c = coverageAsStated(s, fiat);
    expect(c.value).toBe(1.01);
    expect(c.basis).toContain("fiat anchor stated in stellar.toml");
  });
  it("never converts between different units", () => {
    const s = stated({
      liabilities: { supply: "100", unit: "CETES" },
      reserves: [{ type: null, amount: "125", unit: "MXN" }],
    });
    expect(
      coverageAsStated(s, { code: "CETES", anchor_asset_type: "bond", anchor_asset: "MXN" }),
    ).toEqual({
      value: null,
      basis: "units differ (reserves: MXN; liabilities: CETES)",
    });
  });
  it("is null without liabilities or with zero liabilities", () => {
    expect(coverageAsStated(stated({ liabilities: null }), fiat).value).toBeNull();
    expect(
      coverageAsStated(stated({ liabilities: { supply: "0", unit: "USD" } }), fiat).value,
    ).toBeNull();
    expect(coverageAsStated(null, fiat)).toEqual({ value: null, basis: null });
  });
});

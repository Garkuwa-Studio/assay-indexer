import { getDomain } from "tldts";
import type { LinkCheck, ReportDateSource, ReportStatus, StatedFigures } from "./types.js";

export const RECENT_REPORT_DAYS = 35;
const DAY_MS = 86_400_000;

export function reportStatus(input: {
  attestation_of_reserve: string | null;
  link: LinkCheck | null;
  structured: boolean;
}): ReportStatus {
  if (!input.attestation_of_reserve) return "NO_REPORT_LINK";
  if (!input.link || input.link.error_kind) return "LINK_BROKEN";
  return input.structured ? "STRUCTURED_REPORT" : "UNSTRUCTURED_REPORT";
}

/**
 * Report date and age. Age comes only from a date stated in the report
 * (structured) or transcribed by a person (manual); a PDF's file date is
 * recorded but never used as the report's age. HTTP headers are never used.
 */
export function reportDate(
  stated: StatedFigures | null,
  pdfDate: string | null,
  now: Date,
): { date: string | null; source: ReportDateSource | null; age_days: number | null } {
  if (stated?.as_of) {
    const age = Math.floor((now.getTime() - new Date(stated.as_of).getTime()) / DAY_MS);
    return { date: stated.as_of, source: stated.source, age_days: Math.max(0, age) };
  }
  if (pdfDate) return { date: pdfDate, source: "pdf_metadata", age_days: null };
  return { date: null, source: null, age_days: null };
}

const SCALE = 18;
function toScaled(s: string): bigint {
  const [w = "0", f = ""] = s.split(".");
  return BigInt(w) * 10n ** BigInt(SCALE) + BigInt(f.padEnd(SCALE, "0").slice(0, SCALE));
}

/**
 * Coverage = stated reserves / stated liabilities, only when the units can be
 * compared without an assumption we cannot source:
 *  - every reserve unit equals the liabilities unit; or
 *  - liabilities are in the token itself, the issuer's stellar.toml says it is
 *    a fiat-anchored token for unit X, and every reserve is in X (1 token = 1 X).
 * Anything else returns null with the reason. Never estimates.
 */
export function coverageAsStated(
  stated: StatedFigures | null,
  asset: { code: string; anchor_asset_type: string | null; anchor_asset: string | null },
): { value: number | null; basis: string | null } {
  if (!stated?.liabilities) return { value: null, basis: stated ? "liabilities not stated" : null };
  const lu = stated.liabilities.unit;
  const units = new Set(stated.reserves.map((r) => r.unit));
  let basis: string;
  if (units.size === 1 && units.has(lu)) {
    basis = `reserves and liabilities both in ${lu}`;
  } else if (
    lu === asset.code &&
    asset.anchor_asset_type === "fiat" &&
    asset.anchor_asset != null &&
    units.size === 1 &&
    units.has(asset.anchor_asset)
  ) {
    basis = `1 ${asset.code} = 1 ${asset.anchor_asset} (fiat anchor stated in stellar.toml)`;
  } else {
    return {
      value: null,
      basis: `units differ (reserves: ${[...units].join(", ")}; liabilities: ${lu})`,
    };
  }
  const liab = toScaled(stated.liabilities.supply);
  if (liab === 0n) return { value: null, basis: "liabilities stated as zero" };
  const res = stated.reserves.reduce((a, r) => a + toScaled(r.amount), 0n);
  // ratio with 6 decimal places, computed in integers
  const ratio = Number((res * 1_000_000n) / liab) / 1_000_000;
  return { value: ratio, basis };
}

export function isRecent(ageDays: number | null): boolean {
  return ageDays != null && ageDays < RECENT_REPORT_DAYS;
}

/**
 * Board headline rule (decided 2026-10-12, option c, tightened the same day):
 * enough funded holders, or a reserve link on the issuer's own registrable
 * domain. A link to another company's page (e.g. a token on a lookalike
 * domain linking to circle.com) or to a block explorer does not qualify.
 */
export const HEADLINE_MIN_FUNDED_HOLDERS = 50;

export type HeadlineReason = "holders" | "reserve_link" | "holders_and_reserve_link";

export function headline(
  fundedHolders: number | null,
  hasReserveLink: boolean, // a reserve link on the issuer's own registrable domain
  min = HEADLINE_MIN_FUNDED_HOLDERS,
): HeadlineReason | null {
  const byHolders = fundedHolders != null && fundedHolders >= min;
  if (byHolders && hasReserveLink) return "holders_and_reserve_link";
  if (byHolders) return "holders";
  if (hasReserveLink) return "reserve_link";
  return null;
}

/**
 * True when the reserve link is on the same registrable domain as the
 * issuer's home_domain (Public Suffix List, private suffixes included, so
 * a.pages.dev and b.pages.dev are different domains). null if either is
 * missing or unparseable.
 */
export function linkOnIssuerDomain(link: string | null, homeDomain: string | null): boolean | null {
  if (!link || !homeDomain) return null;
  let host: string;
  try {
    host = new URL(link).hostname;
  } catch {
    return null;
  }
  const opts = { allowPrivateDomains: true };
  const a = getDomain(host, opts);
  const b = getDomain(homeDomain, opts);
  return a != null && b != null ? a === b : null;
}

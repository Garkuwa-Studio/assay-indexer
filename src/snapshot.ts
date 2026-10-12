import type { AssetEntry, ReportStatus, Snapshot, SnapshotSummary } from "./types.js";
import { headline, HEADLINE_MIN_FUNDED_HOLDERS, isRecent, linkOnIssuerDomain } from "./status.js";
import type { Holders } from "./holders/index.js";

const STATUSES: ReportStatus[] = [
  "NO_REPORT_LINK",
  "LINK_BROKEN",
  "UNSTRUCTURED_REPORT",
  "STRUCTURED_REPORT",
];

export const HEADLINE_RULE = `Declares is_asset_anchored = true or publishes attestation_of_reserve, AND has at least ${HEADLINE_MIN_FUNDED_HOLDERS} funded holders (stellar.expert) or publishes attestation_of_reserve on the same registrable domain as its home_domain.`;

/** Assets that claim backing: declared anchored, or publishing a reserve link. */
export const claimsBacking = (a: AssetEntry) =>
  a.sep1.is_asset_anchored === true || a.sep1.attestation_of_reserve != null;

/** The board's headline population. */
export const inHeadline = (a: AssetEntry) => claimsBacking(a) && a.headline != null;

/** Summary over the headline set; self_declared_anchored counts every declared-anchored asset. */
export function summarize(
  assets: AssetEntry[],
  counts: {
    assets_with_toml_link: number;
    assets_listed: number;
    assets_invalid_home_domain: number;
  },
): SnapshotSummary {
  const set = assets.filter(inHeadline);
  const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ReportStatus, number>;
  for (const a of set) by_status[a.status]++;
  return {
    ...counts,
    self_declared_anchored: assets.filter((a) => a.sep1.is_asset_anchored === true).length,
    assets_checked: set.length,
    with_report_link: set.filter((a) => a.sep1.attestation_of_reserve).length,
    with_working_link: set.filter((a) => a.report_link && !a.report_link.error_kind).length,
    with_recent_report: set.filter((a) => isRecent(a.report_age_days)).length,
    by_status,
    coverage: {
      method: "value-weighted",
      value: null,
      assets_with_figure: set.filter((a) => a.coverage_as_stated != null).length,
      assets_total: set.length,
      note: "Aggregate coverage needs comparable units and published supply; null in v0.",
    },
  };
}

/** Attach holder counts and headline reasons, then recompute the summary. */
export function enrichSnapshot(
  s: Snapshot,
  holders: Map<string, Holders>,
  source: { url: string; fetched_at: string; min_total: number },
): Snapshot {
  const assets = s.assets.map((a) => {
    const h = holders.get(a.id) ?? null;
    return {
      ...a,
      holders: h,
      reserve_link_on_issuer_domain: linkOnIssuerDomain(
        a.sep1.attestation_of_reserve,
        a.home_domain,
      ),
      headline: headline(
        h?.funded ?? null,
        linkOnIssuerDomain(a.sep1.attestation_of_reserve, a.home_domain) === true,
      ),
    };
  });
  const { assets_with_toml_link, assets_listed, assets_invalid_home_domain } = s.summary;
  return {
    ...s,
    run: {
      ...s.run,
      holders_source: { ...source, assets: holders.size },
      headline_rule: HEADLINE_RULE,
    },
    summary: summarize(assets, {
      assets_with_toml_link,
      assets_listed,
      assets_invalid_home_domain: assets_invalid_home_domain ?? 0,
    }),
    assets,
  };
}

/** Compact file for the board: summary + headline set only. */
export function boardFile(s: Snapshot) {
  return {
    schema: "assay-board-v0" as const,
    snapshot: s.id,
    network: s.network,
    computed_at: s.computed_at,
    ledger_start: s.ledger_start,
    ledger_end: s.ledger_end,
    ledger: s.ledger,
    headline_rule: s.run.headline_rule ?? HEADLINE_RULE,
    holders_source: s.run.holders_source ?? null,
    summary: s.summary,
    assets: s.assets.filter(inHeadline),
  };
}

export function snapshotId(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isSnapshot(x: unknown): x is Snapshot {
  return typeof x === "object" && x !== null && (x as Snapshot).schema === "assay-snapshot-v0";
}

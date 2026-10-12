/** Neutral report statuses. Facts, not ratings. */
export type ReportStatus =
  "NO_REPORT_LINK" | "LINK_BROKEN" | "UNSTRUCTURED_REPORT" | "STRUCTURED_REPORT";

/** Every output carries the ledger and time it was computed at. */
export interface Computed {
  ledger: number | null;
  computed_at: string;
}

/** Why a fetch failed, so "blocked to automated requests" is never shown as "down". */
export type FetchErrorKind =
  "http_4xx" | "http_5xx" | "blocked_403" | "timeout" | "redirect_loop" | "dns" | "tls" | "network";

export type ReportDateSource = "structured" | "manual" | "pdf_metadata";

export interface LinkCheck {
  url: string;
  checked_at: string;
  method: "HEAD" | "GET" | null;
  http_status: number | null;
  final_url: string | null;
  content_type: string | null;
  size_bytes: number | null;
  last_modified: string | null;
  sha256: string | null;
  error_kind: FetchErrorKind | null;
  error: string | null;
}

export interface CollateralCheck {
  address: string;
  chain: "stellar" | "other";
  message: string | null;
  /** true/false for Stellar addresses; null when not checked (reason given). */
  signature_valid: boolean | null;
  message_matches_template: boolean | null;
  valid_from: string | null;
  valid_to: string | null;
  balances: { asset: string; amount: string }[] | null;
  note: string | null;
}

export interface StatedFigures {
  reserves: { type: string | null; amount: string; unit: string }[];
  liabilities: { supply: string; unit: string } | null;
  as_of: string | null;
  attestor: { name: string | null; stellar_key: string | null; role: string | null } | null;
  /** "structured" for reserve-report-v0 JSON, "manual" for data/manual entries. */
  source: "structured" | "manual";
  manual?: { source_url: string; page: string; transcribed_on: string; transcriber: string };
}

export interface AssetEntry {
  id: string; // CODE-ISSUER
  code: string;
  issuer: string;
  home_domain: string | null;
  toml: {
    url: string | null;
    http_status: number | null;
    error_kind: FetchErrorKind | "not_toml" | null;
    currency_listed: boolean;
    currency_via: string | null;
  };
  sep1: {
    status: string | null;
    is_asset_anchored: boolean | null;
    anchor_asset_type: string | null;
    anchor_asset: string | null;
    attestation_of_reserve: string | null;
    redemption_instructions: string | null;
    collateral_addresses: string[];
  };
  status: ReportStatus;
  report_link: LinkCheck | null;
  report_kind: "json" | "pdf" | "html" | "other" | null;
  report_date: string | null;
  report_date_source: ReportDateSource | null;
  report_age_days: number | null;
  stated: StatedFigures | null;
  coverage_as_stated: number | null;
  coverage_basis: string | null;
  manually_transcribed: boolean;
  collateral: CollateralCheck[];
  /** Not published until the supply formula is reconciled (D0 decision 3). */
  supply: null;
  /** Trustline counts from stellar.expert; null when below the fetch floor (fewer than 50 trustlines). */
  holders: { total: number; funded: number } | null;
  /** Reserve link shares the issuer's registrable domain; null when there is no link. */
  reserve_link_on_issuer_domain: boolean | null;
  /** Why the asset is in the board's headline set, or null if it is only self-declared. */
  headline: "holders" | "reserve_link" | "holders_and_reserve_link" | null;
}

export interface SnapshotSummary {
  assets_with_toml_link: number;
  assets_listed: number;
  /** Assets whose home_domain does not form a valid URL; not fetched. */
  assets_invalid_home_domain: number;
  /** Every asset whose stellar.toml says is_asset_anchored = true. */
  self_declared_anchored: number;
  /** Headline set: anchored, with >= 50 funded holders or a reserve link. The board's "checked" figure. */
  assets_checked: number;
  with_report_link: number;
  with_working_link: number;
  with_recent_report: number; // report_age_days < 35
  by_status: Record<ReportStatus, number>;
  coverage: {
    method: "value-weighted";
    value: null;
    assets_with_figure: number;
    assets_total: number;
    note: string;
  };
}

export interface Snapshot {
  schema: "assay-snapshot-v0";
  id: string;
  network: "mainnet";
  computed_at: string;
  ledger_start: number;
  ledger_end: number;
  ledger: number;
  run: {
    max_assets: number | null;
    complete: boolean;
    horizon: string;
    user_agent: string;
    holders_source?: { url: string; fetched_at: string; min_total: number; assets: number };
    headline_rule?: string;
    notes?: string[];
  };
  summary: SnapshotSummary;
  assets: AssetEntry[];
}

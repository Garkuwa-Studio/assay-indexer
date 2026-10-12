/** Neutral report statuses. Facts, not ratings. */
export type ReportStatus =
  "NO_REPORT_LINK" | "LINK_BROKEN" | "UNSTRUCTURED_REPORT" | "STRUCTURED_REPORT";

/** Every output carries the ledger and time it was computed at. */
export interface Computed {
  ledger: number | null;
  computed_at: string;
}

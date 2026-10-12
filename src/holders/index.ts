import { getWithRetry } from "../census/horizon.js";
import type { Fetcher } from "../http.js";

export const STELLAR_EXPERT = "https://api.stellar.expert/explorer/public";

export interface Holders {
  total: number;
  funded: number;
}

interface ExpertPage {
  _embedded: { records: { asset: string; trustlines?: { total?: number; funded?: number } }[] };
  _links?: { next?: { href?: string } };
}

/**
 * Trustline counts for every asset with at least `minTotal` trustlines, from
 * stellar.expert's public list sorted by trustlines (descending). Horizon does
 * not report how many holders have a non-zero balance ("funded"), so this is
 * the one third-party source in a run; snapshots record it.
 *
 * The list is only roughly sorted (observed 2026-10-12: totals out of order
 * within a page), so paging stops only when EVERY total on a page is below
 * `minTotal`. Cost: tens of requests, not one per asset.
 */
export async function fetchHolders(
  f: Fetcher,
  minTotal: number,
  opts: { base?: string; pageSize?: number; maxPages?: number } = {},
): Promise<Map<string, Holders>> {
  const base = opts.base ?? STELLAR_EXPERT;
  const pageSize = opts.pageSize ?? 200;
  const out = new Map<string, Holders>();
  let url = `${base}/asset?sort=trustlines&order=desc&limit=${pageSize}`;
  for (let page = 0; page < (opts.maxPages ?? 1000); page++) {
    const body = (await getWithRetry(f, url)) as ExpertPage;
    const records = body._embedded.records;
    if (records.length === 0) break;
    let highest = 0;
    for (const r of records) {
      const total = r.trustlines?.total ?? 0;
      highest = Math.max(highest, total);
      // "CODE-ISSUER-1" (classic, with asset-type suffix) → "CODE-ISSUER"
      const m = /^([^-]+)-(G[A-Z2-7]{55})(?:-\d)?$/.exec(r.asset);
      if (m && total >= minTotal)
        out.set(`${m[1]}-${m[2]}`, { total, funded: r.trustlines?.funded ?? 0 });
    }
    if (highest < minTotal) break;
    const next = body._links?.next?.href;
    if (!next) break;
    url = new URL(next, base).toString();
  }
  return out;
}

import type { Fetcher } from "../http.js";

export const HORIZON = "https://horizon.stellar.org";

export interface HorizonAsset {
  asset_type: string;
  asset_code: string;
  asset_issuer: string;
  paging_token: string;
  balances: Record<string, string>;
  claimable_balances_amount: string;
  liquidity_pools_amount: string;
  contracts_amount: string;
  _links?: { toml?: { href?: string } };
}

export interface AssetRef {
  code: string;
  issuer: string;
  tomlUrl: string;
  homeDomain: string;
}

interface Page {
  _embedded: { records: HorizonAsset[] };
}

/** GET JSON from Horizon, retrying 429/5xx and network errors with backoff. */
export async function getWithRetry(
  f: Fetcher,
  url: string,
  attempts = 5,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await f(url);
      if (r.ok) return await r.json();
      await r.body?.cancel();
      last = new Error(`HTTP ${r.status} for ${url}`);
      if (r.status !== 429 && r.status < 500) throw last;
    } catch (e) {
      last = e;
      if (e instanceof Error && /^HTTP 4\d\d/.test(e.message) && !e.message.startsWith("HTTP 429"))
        throw e;
    }
    await sleep(Math.min(30_000, 1000 * 2 ** i));
  }
  throw last;
}

/** Latest ledger Horizon has ingested. Read before and after a run. */
export async function latestLedger(f: Fetcher, horizon = HORIZON): Promise<number> {
  const r = await f(horizon);
  if (!r.ok) throw new Error(`Horizon root: HTTP ${r.status}`);
  const body = (await r.json()) as { history_latest_ledger: number };
  return body.history_latest_ledger;
}

/**
 * Page through Horizon /assets (200 per page) from `cursor`, yielding assets
 * whose issuer has a home_domain (Horizon fills `_links.toml` from it).
 * `onPage` receives the cursor after each page so a run can resume.
 */
export async function* listAssetsWithToml(
  f: Fetcher,
  opts: {
    cursor?: string;
    horizon?: string;
    onPage?: (cursor: string, seen: number) => void;
    /** Called for a home_domain that does not form a valid URL (e.g. "%%%" seen on mainnet). */
    onInvalid?: (code: string, issuer: string, href: string) => void;
  } = {},
): AsyncGenerator<AssetRef> {
  const horizon = opts.horizon ?? HORIZON;
  let cursor = opts.cursor ?? "";
  let seen = 0;
  for (;;) {
    const url = `${horizon}/assets?limit=200&order=asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const records = ((await getWithRetry(f, url)) as Page)._embedded.records;
    if (records.length === 0) return;
    for (const a of records) {
      const href = a._links?.toml?.href;
      if (!href) continue;
      let host: string;
      try {
        host = new URL(href).host;
      } catch {
        opts.onInvalid?.(a.asset_code, a.asset_issuer, href);
        continue;
      }
      yield { code: a.asset_code, issuer: a.asset_issuer, tomlUrl: href, homeDomain: host };
    }
    seen += records.length;
    cursor = records[records.length - 1]!.paging_token;
    opts.onPage?.(cursor, seen);
  }
}

export async function getAsset(
  f: Fetcher,
  code: string,
  issuer: string,
  horizon = HORIZON,
): Promise<HorizonAsset | null> {
  const r = await f(
    `${horizon}/assets?asset_code=${encodeURIComponent(code)}&asset_issuer=${issuer}`,
  );
  if (!r.ok) return null;
  return ((await r.json()) as Page)._embedded.records[0] ?? null;
}

// Shared end-to-end fixture: a census run served entirely from test/fixtures.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCensus } from "../src/run.js";
import { fixture, fixtureFetcher, ISSUER, type Route } from "./helpers.js";

const H = "https://horizon.test";
export const ORG = "https://example.org/.well-known/stellar.toml";
const asset = (code: string, toml: string | null) => ({
  asset_type: "credit_alphanum4",
  asset_code: code,
  asset_issuer: ISSUER,
  paging_token: `${code}_${ISSUER}`,
  balances: {},
  claimable_balances_amount: "0",
  liquidity_pools_amount: "0",
  contracts_amount: "0",
  _links: toml ? { toml: { href: toml } } : { toml: { href: "" } },
});

const routes: Record<string, Route> = {
  [H]: { body: { history_latest_ledger: 64905000 } },
  [`${H}/assets?limit=200&order=asc`]: {
    body: {
      _embedded: {
        records: [
          asset("BOND", ORG),
          asset("GOLD", ORG),
          asset("MEME", ORG),
          asset("NODOM", null),
          asset("USDX", ORG),
          asset("BAD", "https://%%%/.well-known/stellar.toml"), // real mainnet home_domain value
          asset("WEB", "https://lander.example/.well-known/stellar.toml"),
        ],
      },
    },
  },
  [`${H}/assets?limit=200&order=asc&cursor=${encodeURIComponent(`WEB_${ISSUER}`)}`]: {
    body: { _embedded: { records: [] } },
  },
  [ORG]: { body: fixture("stellar.toml").toString() },
  "https://example.org/.well-known/GOLD.toml": { body: fixture("GOLD.toml").toString() },
  "https://lander.example/.well-known/stellar.toml": { body: fixture("not-toml.html").toString() },
  "https://example.org/reserves.json": {
    body: fixture("reserves.json").toString(),
    headers: { "content-type": "application/json" },
  },
  "https://example.org/report.pdf": {
    body: new Uint8Array(fixture("report.pdf")),
    headers: { "content-type": "application/pdf" },
  },
  "https://blocked.example/transparency": { status: 403, body: "" },
};

export async function fixtureSnapshot() {
  const manualDir = mkdtempSync(join(tmpdir(), "manual-"));
  writeFileSync(
    join(manualDir, "bond.yaml"),
    `asset: BOND-${ISSUER}
source_url: https://example.org/report.pdf
page: 2
transcribed_on: 2026-10-12
transcriber: test-transcriber
as_of: 2026-09-30
reserves: [{ type: government_bond, amount: "1250000", unit: MXN }]
liabilities: { supply: "1000000", unit: MXN }
`,
  );
  const f = fixtureFetcher(routes);
  const snap = await runCensus({
    fetch: f,
    cacheDir: mkdtempSync(join(tmpdir(), "cache-")),
    manualDir,
    maxAssets: null,
    horizon: H,
    now: () => new Date("2026-10-12T12:00:00Z"),
  });
  return { snap, calls: f.calls };
}

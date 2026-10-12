# assay-indexer

The data service of [Assay](https://github.com/Garkuwa-Studio/assay), by
Garkuwa Labs: open proof of reserves for RWAs and stablecoins on Stellar.

It lists every Stellar mainnet asset whose issuer has a `home_domain`,
reads the issuer's SEP-1 `stellar.toml`, checks each anchored asset's
`attestation_of_reserve` link, and publishes the results as dated JSON
snapshots and a read-only API. Statuses are neutral facts, never ratings.

> Status: v0 (demo sprint D1). Supply is computed but **not published**
> until the formula is reconciled with an independent source; see
> [STACK-STATUS.md §2](https://github.com/Garkuwa-Studio/assay/blob/main/docs/STACK-STATUS.md).

## Run

```bash
corepack enable
pnpm install
pnpm census                    # full mainnet run → data/snapshots/YYYY-MM-DD.json
pnpm census --max-assets 500   # capped run for testing
pnpm census --fresh            # discard the resume cache
pnpm dev                       # API on http://localhost:8787
pnpm lint && pnpm typecheck && pnpm test
```

A run is resumable: the Horizon cursor, asset list and fetched
`stellar.toml` files are cached in `data/cache/` (git-ignored).

Self-host with Docker:

```bash
docker build -t assay-indexer .
docker run -p 8787:8787 -v "$PWD/data:/app/data" assay-indexer
docker run -v "$PWD/data:/app/data" assay-indexer node dist/run.js   # census
```

## What a run does

1. Pages through Horizon `/assets`, keeping assets with a `home_domain`
   (Horizon's `_links.toml`). Invalid domains are counted and skipped.
2. Fetches each `stellar.toml` once, follows `toml = "…"` currency links,
   and matches `[[CURRENCIES]]` by code **and** issuer.
3. Keeps assets with `is_asset_anchored = true` or an
   `attestation_of_reserve` link.
4. Fetches each reserve link (GET): HTTP status, final URL, content type,
   size, `Last-Modified`, SHA-256 of the body, and the kind of failure.
5. Reads figures from a `reserve-report-v0` JSON report, or from a manual
   transcription in `data/manual/`.
6. Checks `collateral_address_signatures` for Stellar addresses and reads
   their balances.
7. Records Horizon's ledger before and after, and writes the snapshot.
8. **Enrich** (`pnpm enrich <snapshot>`, also run at the end of `pnpm census`):
   adds trustline counts from stellar.expert and marks the board's headline
   set, then writes a compact `board-<date>.json` next to the snapshot.

## Headline set

`is_asset_anchored = true` is self-declared, and on mainnet most such assets
are tokens on domains that resemble institutions they are not part of. The
board's headline figures therefore cover assets that claim backing
(declared anchored, or publishing `attestation_of_reserve`) **and** have
either:

- at least **50 funded holders** (trustlines with a balance, from
  stellar.expert's public API; Horizon does not report this), or
- an `attestation_of_reserve` link on the **same registrable domain** as the
  issuer's `home_domain` (Public Suffix List, private suffixes included).
  A link to another company's page or to a block explorer does not count.

Every asset keeps `holders`, `reserve_link_on_issuer_domain` and `headline`
(the reason, or `null`) so the rule can be checked. Assets outside the set
stay in the full snapshot; `self_declared_anchored` counts all of them.

## Statuses

| Status | Meaning |
|---|---|
| `NO_REPORT_LINK` | No `attestation_of_reserve` in the issuer's stellar.toml (the field is optional in SEP-1). |
| `LINK_BROKEN` | A link is published but did not return a document. `report_link.error_kind` says why: `http_4xx`, `blocked_403`, `http_5xx`, `timeout`, `redirect_loop`, `dns`, `tls`, `network`. |
| `UNSTRUCTURED_REPORT` | The link returns a document (HTML, PDF) a person has to read. |
| `STRUCTURED_REPORT` | The link returns a `reserve-report-v0` JSON report for this asset. |

- `report_age_days` comes only from a date stated in a structured report or
  a manual transcription. A PDF's file date is recorded as
  `report_date_source: "pdf_metadata"` but never used as the report's age.
  HTTP headers are never used.
- `coverage_as_stated` = stated reserves ÷ stated liabilities, only when the
  units can be compared without an assumption (same unit, or liabilities in
  the token and reserves in the fiat currency the issuer's stellar.toml
  names). Otherwise `null`, with the reason in `coverage_basis`.

## API (v1, read-only)

| Endpoint | Returns |
|---|---|
| `GET /v1/health` | Service status and the snapshot being served |
| `GET /v1/summary` | Counts for the board: anchored assets, working links, recent reports, statuses |
| `GET /v1/assets?anchored=true&status=…&type=…&limit=&offset=` | Asset list |
| `GET /v1/assets/{CODE}-{ISSUER}` | One asset |

Every response includes `snapshot`, `ledger`, `computed_at` and a
disclaimer. Before the first snapshot, data endpoints return 503.

## Manual transcriptions

`data/manual/*.yaml`, one entry or a list. Required: `asset`
(`CODE-ISSUER`), `source_url`, `page`, `transcribed_on`, `transcriber`,
`as_of`, `reserves`. An entry missing any of these fails the run. The API
marks these figures `"manually_transcribed": true`.

```yaml
asset: CODE-GABC…
source_url: https://issuer.example/reserves-2026-09.pdf
page: 3
transcribed_on: 2026-10-12
transcriber: github-handle
as_of: 2026-09-30
reserves:
  - { type: cash, amount: "1010000.00", unit: USD }
liabilities: { supply: "1000000.00", unit: USD }
```

## Layout

```
src/census       Horizon asset listing (resumable)
src/toml         SEP-1 stellar.toml fetch, parse, currency match
src/reports      reserve-link checks, reserve-report-v0, PDF dates
src/supply       Horizon supply formula (not published yet)
src/collateral   SEP-1 collateral signature checks
src/manual       manual transcription loading and validation
src/status.ts    status, report age, coverage rules
src/run.ts       one census run → snapshot
src/api          read-only HTTP API (Hono)
test/fixtures    recorded responses; tests never touch the network
```

## Why Hono

The API is small, read-only and versioned. Hono is a few KB, uses
Web-standard Request/Response, and runs unchanged on Node, Docker or an edge
host.

## Licence

Apache-2.0. See [CONTRIBUTING.md](CONTRIBUTING.md).

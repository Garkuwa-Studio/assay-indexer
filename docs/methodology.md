# Methodology

How a census run works, what goes into the headline set, and how manual
transcriptions are recorded. For a quick overview, see the
[README](../README.md).

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

A run is resumable: the Horizon cursor, asset list and fetched
`stellar.toml` files are cached in `data/cache/` (git-ignored).

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

## Report age and coverage

- `report_age_days` comes only from a date stated in a structured report or
  a manual transcription. A PDF's file date is recorded as
  `report_date_source: "pdf_metadata"` but never used as the report's age.
  HTTP headers are never used.
- `coverage_as_stated` = stated reserves ÷ stated liabilities, only when the
  units can be compared without an assumption (same unit, or liabilities in
  the token and reserves in the fiat currency the issuer's stellar.toml
  names). Otherwise `null`, with the reason in `coverage_basis`.

`LINK_BROKEN` assets carry `report_link.error_kind`: `http_4xx`,
`blocked_403`, `http_5xx`, `timeout`, `redirect_loop`, `dns`, `tls` or
`network`.

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

## Weekly census

`.github/workflows/census.yml` runs every Monday at 03:00 UTC (and on
demand from the Actions tab). It runs a fresh census, commits the small
`data/snapshots/board-YYYY-MM-DD.json`, and publishes a release
`snapshot-YYYY-MM-DD` with `board.json` and the full snapshot (gzipped).
Full snapshots are not committed. The board pulls
`releases/latest/download/board.json` at 08:00 UTC.

To test the workflow without publishing, run it manually with
`max_assets` set (for example 500): a capped run is never committed or
released.

## Why Hono

The API is small, read-only and versioned. Hono is a few KB, uses
Web-standard Request/Response, and runs unchanged on Node, Docker or an edge
host.

# assay-indexer

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Open proof-of-reserves data for anchored assets on Stellar.

assay-indexer is the data service behind [Assay](https://github.com/Garkuwa-Studio/assay)
by Garkuwa Labs. It finds every Stellar mainnet asset whose issuer
publishes a `stellar.toml`, checks the reserve report each anchored asset
links to, and publishes the results as dated JSON snapshots and a
read-only API.

It reports what issuers publish. It does not rate assets or guess at
missing numbers: if a value isn't known, it's `null`.

> **Status: v0.** Supply is computed but not published yet. It stays
> unpublished until the formula matches an independent source
> ([details](https://github.com/Garkuwa-Studio/assay/blob/main/docs/STACK-STATUS.md)).

## Quick start

Requires Node 24+ and pnpm (via `corepack enable`).

```bash
pnpm install
pnpm census --max-assets 500   # small test run → data/snapshots/
pnpm dev                       # API on http://localhost:8787
```

Run `pnpm census` without a cap for a full mainnet census. Runs can be
resumed; add `--fresh` to start over.

Or use Docker:

```bash
docker build -t assay-indexer .
docker run -v "$PWD/data:/app/data" assay-indexer node dist/run.js   # census
docker run -p 8787:8787 -v "$PWD/data:/app/data" assay-indexer       # API
```

## Statuses

Each anchored asset gets one status:

| Status | Meaning |
|---|---|
| `NO_REPORT_LINK` | The issuer's stellar.toml has no `attestation_of_reserve` link. |
| `LINK_BROKEN` | A link is published, but it doesn't return a document. |
| `UNSTRUCTURED_REPORT` | The link returns a document (HTML or PDF) that a person has to read. |
| `STRUCTURED_REPORT` | The link returns a machine-readable `reserve-report-v0` JSON report. |

Assets also carry `report_age_days` and `coverage_as_stated` when the
report states them. Otherwise both are `null`.

## API

Read-only and versioned under `/v1`.

| Endpoint | Returns |
|---|---|
| `GET /v1/health` | Service status and the snapshot being served |
| `GET /v1/summary` | Totals and status counts |
| `GET /v1/assets` | Asset list (`anchored`, `status`, `type`, `limit`, `offset`) |
| `GET /v1/assets/{CODE}-{ISSUER}` | One asset |

Every response includes the `snapshot`, `ledger` and `computed_at` it was
built from.

## Learn more

- [Methodology](docs/methodology.md): how a run works, the headline set,
  manual transcriptions, the weekly census
- [Assay](https://github.com/Garkuwa-Studio/assay): the core project

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
first. Before opening a PR, run:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Tests use recorded fixtures and never call the live network.

Found a security issue? Please report it
[privately](https://github.com/Garkuwa-Studio/assay-indexer/security/advisories/new).

## License

[Apache-2.0](LICENSE)

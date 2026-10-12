# assay-indexer

The data service of [Assay](https://github.com/garkuwa-labs/assay), by
Garkuwa Labs: open proof of reserves for RWAs and stablecoins on Stellar.

It builds a census of anchored Stellar assets, reads their SEP-1
`stellar.toml` fields, fetches and checks reserve reports, records supply at
a given ledger, and serves the results as snapshots and a read-only API.
Statuses are neutral facts (`NO_REPORT_LINK`, `LINK_BROKEN`,
`UNSTRUCTURED_REPORT`, `STRUCTURED_REPORT`), never ratings.

> Status: scaffold. Only `GET /v1/health` exists.

## Run

```bash
corepack enable
pnpm install
pnpm dev              # http://localhost:8787/v1/health
pnpm lint && pnpm typecheck && pnpm test
```

Self-host with Docker:

```bash
docker build -t assay-indexer .
docker run -p 8787:8787 assay-indexer
```

## Layout

```
src/census    anchored-asset census
src/toml      SEP-1 stellar.toml fetch and parse
src/reports   reserve-report fetch and checks
src/supply    supply at a recorded ledger
src/api       read-only HTTP API (Hono), versioned under /v1
data/manual   manual transcriptions (YAML, with source + transcriber)
data/snapshots  committed JSON snapshots
test/fixtures recorded responses; tests never hit the network
```

## Why Hono

The API is small, read-only and versioned. Hono is a few KB, uses
Web-standard Request/Response, and runs unchanged on Node, Docker or an edge
host. Fastify's plugin system and schema compiler would be weight without a
current use.

## Licence

Apache-2.0. See [CONTRIBUTING.md](CONTRIBUTING.md).

# Contributing to assay-indexer

PRs welcome. Sign off every commit under the
[DCO](https://developercertificate.org/) (`git commit -s`).

## Rules

- Public data only. Store nothing personal; no analytics.
- Crawl politely: rate limits, caching, resumable runs, and a clear
  User-Agent with a contact URL.
- Never infer a number. Unknown is `null`.
- Manual transcriptions in `data/manual/*.yaml` must include source URL,
  page, date transcribed and transcriber.
- Every output carries the ledger and timestamp it was computed at.
- The API is versioned (`/v1`); breaking changes need a new version.
- Tests use recorded fixtures in `test/fixtures/`, never the live network.
- Never commit keys or `.env` files.

`pnpm lint && pnpm typecheck && pnpm test` must pass.

Security issues: report privately via
[GitHub private vulnerability reporting](https://github.com/garkuwa-labs/assay-indexer/security/advisories/new).

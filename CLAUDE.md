# CLAUDE.md — assay-indexer

The data service of Assay, by Garkuwa Labs. Org repos: assay (core) ·
assay-indexer (this) · assay-board · proposals · .github. Spec: Prompt 0b
(10-build-prompts.md) and D1 (11-demo-sprint-prompts.md) in ../proposals/specs/.

## What it does
Census of anchored Stellar assets → SEP-1 fields → reserve-report fetch and
checks → supply at a recorded ledger → collateral-address checks →
snapshots + read-only API → (later) supply-witness posts to the registry.

## Rules
- Public data only. Store nothing personal; no analytics.
- Polite crawling: rate limits, caching, resumable runs, a clear
  User-Agent with a contact URL.
- Statuses are neutral facts: NO_REPORT_LINK · LINK_BROKEN ·
  UNSTRUCTURED_REPORT · STRUCTURED_REPORT, plus report_age_days and
  coverage_as_stated (null when unknown). Never infer a number.
- Manual transcriptions (data/manual/*.yaml) must include source URL, page,
  date transcribed and transcriber; the API marks them as such.
- Every output carries the ledger and timestamp it was computed at.
- Supply is not published (API returns null) until the Horizon formula is
  reconciled with an independent source at a pinned ledger. D0 found a
  0.053% gap for USDC vs stellar.expert (assay/docs/STACK-STATUS.md §2).
- API is versioned (/v1); breaking changes need a new version.
- Unit tests use recorded fixtures, never the live network.
- The supply-witness signing key (later) is read from the environment only,
  never logged or committed. Testnet first.
- Plan first, WAIT. Build to green (lint, typecheck, tests). Don't push.

## Status (human updates)
- [ ] Prompt 0b scaffold
- [ ] D1 first mainnet snapshot committed (date ____, assets ____)
- [ ] Public API deployed — URL ____
- [ ] Supply witness posting on testnet (T1)

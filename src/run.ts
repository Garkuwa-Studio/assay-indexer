/**
 * One census run against Stellar mainnet:
 *   pnpm census [--max-assets N] [--concurrency 12] [--fresh] [--out data/snapshots]
 * Resumable: the Horizon cursor, asset list and fetched TOMLs are cached in
 * data/cache/ (git-ignored). --fresh discards the cache.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { HORIZON, latestLedger, listAssetsWithToml, type AssetRef } from "./census/horizon.js";
import { checkCollateral } from "./collateral/index.js";
import { politeFetcher, USER_AGENT, type Fetcher } from "./http.js";
import { loadManual, manualToStated } from "./manual/index.js";
import { checkReport, type ReportResult } from "./reports/index.js";
import { parseStructured } from "./reports/structured.js";
import { enrich, writeSnapshotAndBoard } from "./enrich.js";
import { summarize, snapshotId } from "./snapshot.js";
import {
  coverageAsStated,
  headline,
  linkOnIssuerDomain,
  reportDate,
  reportStatus,
} from "./status.js";
import { fetchToml, findCurrency, sep1Fields, type Toml, type TomlFetch } from "./toml/index.js";
import type { AssetEntry, Snapshot } from "./types.js";

const log = (s: string) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${s}\n`);

async function mapPool<T, R>(
  items: T[],
  n: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export interface RunOptions {
  fetch: Fetcher;
  cacheDir: string;
  manualDir: string;
  maxAssets: number | null;
  now?: () => Date;
  horizon?: string;
  tomlConcurrency?: number;
}

export async function runCensus(o: RunOptions): Promise<Snapshot> {
  const now = o.now ?? (() => new Date());
  const f = o.fetch;
  const horizon = o.horizon ?? HORIZON;
  mkdirSync(join(o.cacheDir, "toml"), { recursive: true });
  const manual = loadManual(o.manualDir); // fail fast on invalid entries

  const startedAt = now();
  const ledgerNow = await latestLedger(f, horizon);

  // 1. Assets with a home_domain (resumable)
  const listFile = join(o.cacheDir, "assets.json");
  interface ListState {
    cursor: string;
    done: boolean;
    refs: AssetRef[];
    seen: number;
    invalid: number;
    /** Ledger when listing began; kept across resumes so the snapshot shows the full data window. */
    ledger_start?: number;
  }
  const state: ListState = existsSync(listFile)
    ? (JSON.parse(readFileSync(listFile, "utf8")) as ListState)
    : { cursor: "", done: false, refs: [], seen: 0, invalid: 0 };
  state.invalid ??= 0;
  state.ledger_start ??= ledgerNow;
  const ledgerStart = state.ledger_start;
  log(
    `ledger_start ${ledgerStart}${ledgerStart !== ledgerNow ? ` (resumed at ${ledgerNow})` : ""}`,
  );
  if (!state.done) {
    log(`listing assets from cursor "${state.cursor}" (${state.refs.length} with toml so far)`);
    let lastSave = Date.now();
    const seenBefore = state.seen;
    for await (const ref of listAssetsWithToml(f, {
      cursor: state.cursor,
      horizon,
      onInvalid: () => {
        state.invalid++;
      },
      onPage: (cursor, seen) => {
        state.cursor = cursor;
        state.seen = seenBefore + seen;
        if (Date.now() - lastSave > 10_000) {
          writeFileSync(listFile, JSON.stringify(state));
          lastSave = Date.now();
          log(`  … ${state.seen} assets read, ${state.refs.length} with toml`);
        }
      },
    })) {
      state.refs.push(ref);
      if (o.maxAssets != null && state.refs.length >= o.maxAssets) break;
    }
    state.done = true;
    writeFileSync(listFile, JSON.stringify(state));
  }
  const refs = o.maxAssets != null ? state.refs.slice(0, o.maxAssets) : state.refs;
  log(`${refs.length} assets with a toml link`);

  // 2. One TOML fetch per URL (cached on disk for resume)
  const tomlUrls = [...new Set(refs.map((r) => r.tomlUrl))];
  log(`${tomlUrls.length} stellar.toml files to read`);
  const tomls = new Map<string, TomlFetch>();
  let done = 0;
  await mapPool(tomlUrls, o.tomlConcurrency ?? 12, async (url) => {
    const file = join(o.cacheDir, "toml", `${hash(url)}.json`);
    let t: TomlFetch;
    if (existsSync(file)) t = JSON.parse(readFileSync(file, "utf8")) as TomlFetch;
    else {
      t = await fetchToml(f, url);
      writeFileSync(file, JSON.stringify(t));
    }
    tomls.set(url, t);
    if (++done % 250 === 0) log(`  … ${done}/${tomlUrls.length} toml`);
  });

  const linkedCache = new Map<string, Promise<Toml | null>>();
  const fetchLinked = (url: string) => {
    if (!linkedCache.has(url))
      linkedCache.set(
        url,
        fetchToml(f, url).then((t) => t.data),
      );
    return linkedCache.get(url)!;
  };

  // 3. Match currencies; keep anchored assets and any asset with a reserve link
  let listed = 0;
  const kept: {
    ref: AssetRef;
    t: TomlFetch;
    via: string | null;
    fields: ReturnType<typeof sep1Fields>;
  }[] = [];
  for (const ref of refs) {
    const t = tomls.get(ref.tomlUrl)!;
    const match = t.data ? await findCurrency(t.data, ref.code, ref.issuer, fetchLinked) : null;
    if (match) listed++;
    const fields = sep1Fields(match?.currency ?? null);
    if (fields.is_asset_anchored === true || fields.attestation_of_reserve) {
      kept.push({ ref, t, via: match?.via ?? null, fields });
    }
  }
  log(`${listed} listed in their stellar.toml; ${kept.length} anchored or with a reserve link`);

  // 4. Report links (one fetch per URL) and collateral
  const reportUrls = [
    ...new Set(kept.map((k) => k.fields.attestation_of_reserve).filter((u): u is string => !!u)),
  ];
  log(`${reportUrls.length} reserve links to check`);
  const reports = new Map<string, ReportResult>();
  await mapPool(reportUrls, 6, async (url) => {
    reports.set(url, await checkReport(f, url, now));
  });

  const nowDate = now();
  const assets: AssetEntry[] = [];
  for (const { ref, t, via, fields } of kept) {
    const id = `${ref.code}-${ref.issuer}`;
    const rep = fields.attestation_of_reserve
      ? (reports.get(fields.attestation_of_reserve) ?? null)
      : null;
    // A JSON report may be shared by several assets; match it to this one.
    const structured = rep?.json != null ? parseStructured(rep.json, ref.code, ref.issuer) : null;
    const m = manual.get(id);
    const stated = structured ?? (m ? manualToStated(m) : null);
    const d = reportDate(stated, rep?.pdf_date ?? null, nowDate);
    const cov = coverageAsStated(stated, { code: ref.code, ...fields });
    assets.push({
      id,
      code: ref.code,
      issuer: ref.issuer,
      home_domain: ref.homeDomain,
      toml: {
        url: ref.tomlUrl,
        http_status: t.http_status,
        error_kind: t.error_kind,
        currency_listed: via != null,
        currency_via: via,
      },
      sep1: {
        status: fields.status,
        is_asset_anchored: fields.is_asset_anchored,
        anchor_asset_type: fields.anchor_asset_type,
        anchor_asset: fields.anchor_asset,
        attestation_of_reserve: fields.attestation_of_reserve,
        redemption_instructions: fields.redemption_instructions,
        collateral_addresses: fields.collateral_addresses,
      },
      status: reportStatus({
        attestation_of_reserve: fields.attestation_of_reserve,
        link: rep?.link ?? null,
        structured: structured != null,
      }),
      report_link: rep?.link ?? null,
      report_kind: rep?.kind ?? null,
      report_date: d.date,
      report_date_source: d.source,
      report_age_days: d.age_days,
      stated,
      coverage_as_stated: cov.value,
      coverage_basis: cov.basis,
      manually_transcribed: stated?.source === "manual",
      collateral: fields.collateral_addresses.length ? await checkCollateral(f, fields, ref) : [],
      supply: null,
      holders: null, // filled by enrich()
      reserve_link_on_issuer_domain: linkOnIssuerDomain(
        fields.attestation_of_reserve,
        ref.homeDomain,
      ),
      // Link-only part of the rule; enrich() adds the holders part.
      headline: headline(
        null,
        linkOnIssuerDomain(fields.attestation_of_reserve, ref.homeDomain) === true,
      ),
    });
  }
  assets.sort((a, b) => a.id.localeCompare(b.id));

  const ledgerEnd = await latestLedger(f, horizon);
  log(`ledger_end ${ledgerEnd}`);
  return {
    schema: "assay-snapshot-v0",
    id: snapshotId(startedAt),
    network: "mainnet",
    computed_at: nowDate.toISOString(),
    ledger_start: ledgerStart,
    ledger_end: ledgerEnd,
    ledger: ledgerEnd,
    run: {
      max_assets: o.maxAssets,
      complete: o.maxAssets == null,
      horizon,
      user_agent: USER_AGENT,
    },
    summary: summarize(assets, {
      assets_with_toml_link: refs.length,
      assets_listed: listed,
      assets_invalid_home_domain: state.invalid,
    }),
    assets,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      "max-assets": { type: "string" },
      fresh: { type: "boolean", default: false },
      out: { type: "string", default: "data/snapshots" },
      cache: { type: "string", default: "data/cache" },
      // Requests in flight across all hosts; each host still gets at most 1 req/s.
      concurrency: { type: "string", default: "12" },
    },
  });
  if (values.fresh) rmSync(values.cache, { recursive: true, force: true });
  const concurrency = Math.max(1, Math.min(64, Number(values.concurrency) || 12));
  const snapshot = await runCensus({
    fetch: politeFetcher({ perHostIntervalMs: 1000, concurrency }),
    tomlConcurrency: concurrency,
    cacheDir: values.cache,
    manualDir: "data/manual",
    maxAssets: values["max-assets"] ? Number(values["max-assets"]) : null,
  });
  mkdirSync(values.out, { recursive: true });
  const file = join(values.out, `${snapshot.id}.json`);
  writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`); // keep the raw run even if enrich fails
  log("fetching holder counts (stellar.expert)");
  const enriched = await enrich(
    snapshot,
    politeFetcher({ perHostIntervalMs: 1000, concurrency: 1 }),
  );
  const board = writeSnapshotAndBoard(enriched, file);
  log(`wrote ${file} and ${board}: ${JSON.stringify(enriched.summary)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

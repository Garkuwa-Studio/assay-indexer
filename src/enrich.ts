/**
 * Add holder counts and the board headline flag to a snapshot, and write the
 * compact board file next to it:
 *   pnpm enrich data/snapshots/2026-10-12.json
 * Also run automatically at the end of `pnpm census`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { politeFetcher, type Fetcher } from "./http.js";
import { fetchHolders, STELLAR_EXPERT } from "./holders/index.js";
import { boardFile, enrichSnapshot, isSnapshot } from "./snapshot.js";
import { HEADLINE_MIN_FUNDED_HOLDERS } from "./status.js";
import type { Snapshot } from "./types.js";

export async function enrich(s: Snapshot, f: Fetcher, now = () => new Date()): Promise<Snapshot> {
  const holders = await fetchHolders(f, HEADLINE_MIN_FUNDED_HOLDERS);
  return enrichSnapshot(s, holders, {
    url: `${STELLAR_EXPERT}/asset?sort=trustlines&order=desc`,
    fetched_at: now().toISOString(),
    min_total: HEADLINE_MIN_FUNDED_HOLDERS,
  });
}

export function writeSnapshotAndBoard(s: Snapshot, file: string): string {
  writeFileSync(file, `${JSON.stringify(s, null, 2)}\n`);
  const board = join(dirname(file), `board-${basename(file)}`);
  writeFileSync(board, `${JSON.stringify(boardFile(s), null, 2)}\n`);
  return board;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: pnpm enrich data/snapshots/YYYY-MM-DD.json");
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isSnapshot(data)) throw new Error(`${file} is not an assay-snapshot-v0`);
  const s = await enrich(data, politeFetcher({ perHostIntervalMs: 1000, concurrency: 1 }));
  const board = writeSnapshotAndBoard(s, file);
  process.stderr.write(`wrote ${file} and ${board}: ${JSON.stringify(s.summary)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isSnapshot } from "../snapshot.js";
import type { Snapshot } from "../types.js";

/** Latest snapshot in a directory (files named YYYY-MM-DD.json), or null. */
export function loadLatestSnapshot(dir: string): Snapshot | null {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  } catch {
    return null;
  }
  const last = files.at(-1);
  if (!last) return null;
  const data: unknown = JSON.parse(readFileSync(join(dir, last), "utf8"));
  return isSnapshot(data) ? data : null;
}

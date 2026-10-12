import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { StatedFigures } from "../types.js";

const amount = z.string().regex(/^\d+(\.\d+)?$/, "amount must be a decimal string");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "use YYYY-MM-DD");

/**
 * A figure read by a person from a report (usually a PDF). Source URL, page,
 * date transcribed and transcriber are REQUIRED; the API marks the result
 * "manually transcribed".
 */
export const ManualEntry = z.object({
  asset: z.string().regex(/^[A-Za-z0-9]{1,12}-G[A-Z2-7]{55}$/, "asset must be CODE-ISSUER"),
  source_url: z.url(),
  page: z.union([z.string().min(1), z.number().int().positive()]).transform(String),
  transcribed_on: isoDate,
  transcriber: z.string().min(1),
  as_of: isoDate,
  reserves: z
    .array(z.object({ type: z.string().optional(), amount, unit: z.string().min(1) }))
    .min(1),
  liabilities: z.object({ supply: amount, unit: z.string().min(1) }).optional(),
  attestor: z.object({ name: z.string().optional(), role: z.string().optional() }).optional(),
});
export type ManualEntry = z.infer<typeof ManualEntry>;

/** Load and validate every data/manual/*.yaml. Throws on any invalid entry (fail the run). */
export function loadManual(dir: string): Map<string, ManualEntry> {
  const out = new Map<string, ManualEntry>();
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  } catch {
    return out;
  }
  for (const f of files) {
    const raw: unknown = parse(readFileSync(join(dir, f), "utf8"));
    // Validate as a list or a single entry so errors name the missing field.
    const parsed = Array.isArray(raw)
      ? z.array(ManualEntry).safeParse(raw)
      : ManualEntry.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `${f}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    }
    for (const e of Array.isArray(parsed.data) ? parsed.data : [parsed.data]) {
      const prev = out.get(e.asset);
      if (!prev || e.as_of > prev.as_of) out.set(e.asset, e);
    }
  }
  return out;
}

export function manualToStated(e: ManualEntry): StatedFigures {
  return {
    reserves: e.reserves.map((r) => ({ type: r.type ?? null, amount: r.amount, unit: r.unit })),
    liabilities: e.liabilities ?? null,
    as_of: new Date(`${e.as_of}T00:00:00Z`).toISOString(),
    attestor: e.attestor
      ? { name: e.attestor.name ?? null, stellar_key: null, role: e.attestor.role ?? null }
      : null,
    source: "manual",
    manual: {
      source_url: e.source_url,
      page: e.page,
      transcribed_on: e.transcribed_on,
      transcriber: e.transcriber,
    },
  };
}

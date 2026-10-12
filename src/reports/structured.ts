import { z } from "zod";
import type { StatedFigures } from "../types.js";

/**
 * Draft reserve report format, assay architecture §4.4 ("reserve-report-v0").
 * The signature is recorded but NOT verified in v0 (canonicalization is
 * defined in the SEP draft, D5).
 */
const amount = z.string().regex(/^\d+(\.\d+)?$/);
export const ReserveReportV0 = z.object({
  sep: z.literal("reserve-report-v0"),
  asset: z.string(),
  as_of: z.iso.datetime({ offset: true }),
  ledger: z.number().int().nonnegative().optional(),
  reserves: z.array(z.object({ type: z.string().optional(), amount, unit: z.string() })).min(1),
  liabilities: z.object({ supply: amount, unit: z.string() }),
  attestor: z
    .object({
      name: z.string().optional(),
      stellar_key: z.string().optional(),
      role: z.string().optional(),
    })
    .optional(),
  evidence: z.array(z.object({ uri: z.string(), sha256: z.string().optional() })).optional(),
  signature: z.string().optional(),
});
export type ReserveReportV0 = z.infer<typeof ReserveReportV0>;

/** Returns stated figures if the JSON is a reserve-report-v0 for this asset, else null. */
export function parseStructured(json: unknown, code: string, issuer: string): StatedFigures | null {
  const r = ReserveReportV0.safeParse(json);
  if (!r.success) return null;
  const d = r.data;
  if (d.asset !== `${code}:${issuer}`) return null;
  return {
    reserves: d.reserves.map((x) => ({ type: x.type ?? null, amount: x.amount, unit: x.unit })),
    liabilities: d.liabilities,
    as_of: d.as_of,
    attestor: d.attestor
      ? {
          name: d.attestor.name ?? null,
          stellar_key: d.attestor.stellar_key ?? null,
          role: d.attestor.role ?? null,
        }
      : null,
    source: "structured",
  };
}

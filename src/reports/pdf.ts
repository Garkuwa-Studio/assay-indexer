import { getMeta } from "unpdf";

/**
 * Document date from PDF metadata (ModDate, else CreationDate). This is the
 * date the FILE was made, not the date the report covers; callers label it
 * "pdf_metadata" and the board shows it as "document date".
 */
export async function pdfDocumentDate(bytes: Uint8Array): Promise<string | null> {
  try {
    const { info } = await getMeta(bytes.slice(), { parseDates: true });
    const d = (info.ModDate ?? info.CreationDate) as unknown;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
    if (typeof d === "string") return parsePdfDate(d);
    return null;
  } catch {
    return null;
  }
}

/** Parse "D:YYYYMMDDHHmmSSOHH'mm'" into ISO, or null. */
export function parsePdfDate(s: string): string | null {
  const m =
    /^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?/.exec(s);
  if (!m) return null;
  const [, y, mo = "01", d = "01", h = "00", mi = "00", se = "00", tz, th = "00", tm = "00"] = m;
  const offset = !tz || tz.toUpperCase() === "Z" ? "Z" : `${tz}${th}:${tm}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

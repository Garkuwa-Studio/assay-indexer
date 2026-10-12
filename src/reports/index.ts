import { createHash } from "node:crypto";
import { classifyError, classifyStatus, type Fetcher } from "../http.js";
import type { LinkCheck } from "../types.js";
import { pdfDocumentDate } from "./pdf.js";

const MAX_REPORT_BYTES = 25 * 1024 * 1024;

export interface ReportResult {
  link: LinkCheck;
  kind: "json" | "pdf" | "html" | "other" | null;
  /** Parsed body when the report is JSON; matched to assets by the caller. */
  json: unknown;
  pdf_date: string | null;
}

function kindOf(contentType: string | null, bytes: Uint8Array): ReportResult["kind"] {
  const ct = (contentType ?? "").toLowerCase();
  const head = new TextDecoder().decode(bytes.subarray(0, 16)).trimStart();
  if (head.startsWith("%PDF") || ct.includes("pdf")) return "pdf";
  if (ct.includes("json") || head.startsWith("{")) return "json";
  if (ct.includes("html") || head.toLowerCase().startsWith("<!doctype") || head.startsWith("<"))
    return "html";
  return "other";
}

async function readCapped(r: Response): Promise<Uint8Array | null> {
  const reader = r.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REPORT_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Fetch an attestation_of_reserve link (GET, so the body can be hashed) and record facts. */
export async function checkReport(
  f: Fetcher,
  url: string,
  now: () => Date = () => new Date(),
): Promise<ReportResult> {
  const base: LinkCheck = {
    url,
    checked_at: now().toISOString(),
    method: "GET",
    http_status: null,
    final_url: null,
    content_type: null,
    size_bytes: null,
    last_modified: null,
    sha256: null,
    error_kind: null,
    error: null,
  };
  let r: Response;
  try {
    r = await f(url);
  } catch (e) {
    const { kind, message } = classifyError(e);
    return {
      link: { ...base, error_kind: kind, error: message },
      kind: null,
      json: null,
      pdf_date: null,
    };
  }
  const link: LinkCheck = {
    ...base,
    http_status: r.status,
    final_url: r.url || url,
    content_type: r.headers.get("content-type"),
    last_modified: r.headers.get("last-modified"),
  };
  const errKind = classifyStatus(r.status);
  if (errKind) {
    await r.body?.cancel();
    return {
      link: { ...link, error_kind: errKind, error: `HTTP ${r.status}` },
      kind: null,
      json: null,
      pdf_date: null,
    };
  }
  const bytes = await readCapped(r);
  if (!bytes) {
    return {
      link: { ...link, error: "body over 25 MB, not read" },
      kind: kindOf(link.content_type, new Uint8Array()),
      json: null,
      pdf_date: null,
    };
  }
  link.size_bytes = bytes.byteLength;
  link.sha256 = createHash("sha256").update(bytes).digest("hex");
  const kind = kindOf(link.content_type, bytes);

  let json: unknown = null;
  let pdf_date: string | null = null;
  if (kind === "json") {
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      json = null;
    }
  } else if (kind === "pdf") {
    pdf_date = await pdfDocumentDate(bytes);
  }
  return { link, kind, json, pdf_date };
}

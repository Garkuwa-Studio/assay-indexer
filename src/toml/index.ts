import { parse } from "smol-toml";
import { classifyError, classifyStatus, type Fetcher } from "../http.js";
import type { FetchErrorKind } from "../types.js";

export type Toml = Record<string, unknown>;

export interface TomlFetch {
  url: string;
  http_status: number | null;
  error_kind: FetchErrorKind | "not_toml" | null;
  error: string | null;
  data: Toml | null;
}

const MAX_TOML_BYTES = 512 * 1024;

export async function fetchToml(f: Fetcher, url: string): Promise<TomlFetch> {
  let r: Response;
  try {
    r = await f(url);
  } catch (e) {
    const { kind, message } = classifyError(e);
    return { url, http_status: null, error_kind: kind, error: message, data: null };
  }
  const kind = classifyStatus(r.status);
  if (kind) {
    await r.body?.cancel();
    return { url, http_status: r.status, error_kind: kind, error: `HTTP ${r.status}`, data: null };
  }
  const text = await r.text();
  if (text.length > MAX_TOML_BYTES) {
    return { url, http_status: r.status, error_kind: "not_toml", error: "too large", data: null };
  }
  try {
    return { url, http_status: r.status, error_kind: null, error: null, data: parse(text) as Toml };
  } catch (e) {
    // D0: some domains serve an HTML page at /.well-known/stellar.toml.
    return {
      url,
      http_status: r.status,
      error_kind: "not_toml",
      error: (e as Error).message.split("\n")[0] ?? "parse error",
      data: null,
    };
  }
}

export interface CurrencyMatch {
  currency: Toml;
  via: string; // "stellar.toml" or the linked currency TOML URL
}

/**
 * Find the [[CURRENCIES]] entry for code + issuer. Entries that are only a
 * `toml = "…"` link are fetched (via `fetchLinked`, cached by the caller).
 */
export async function findCurrency(
  data: Toml,
  code: string,
  issuer: string,
  fetchLinked: (url: string) => Promise<Toml | null>,
): Promise<CurrencyMatch | null> {
  const list = Array.isArray(data.CURRENCIES) ? (data.CURRENCIES as Toml[]) : [];
  for (const c of list) {
    if (c.code === code && c.issuer === issuer) return { currency: c, via: "stellar.toml" };
  }
  for (const c of list) {
    if (typeof c.toml === "string" && c.code == null) {
      const linked = await fetchLinked(c.toml);
      if (linked?.code === code && linked?.issuer === issuer)
        return { currency: linked, via: c.toml };
    }
  }
  return null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function sep1Fields(c: Toml | null) {
  return {
    status: str(c?.status),
    is_asset_anchored: typeof c?.is_asset_anchored === "boolean" ? c.is_asset_anchored : null,
    anchor_asset_type: str(c?.anchor_asset_type),
    anchor_asset: str(c?.anchor_asset),
    attestation_of_reserve: str(c?.attestation_of_reserve),
    redemption_instructions: str(c?.redemption_instructions),
    collateral_addresses: strList(c?.collateral_addresses),
    collateral_address_messages: strList(c?.collateral_address_messages),
    collateral_address_signatures: strList(c?.collateral_address_signatures),
  };
}

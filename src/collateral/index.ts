import { Keypair, StrKey } from "@stellar/stellar-sdk";
import type { Fetcher } from "../http.js";
import { HORIZON } from "../census/horizon.js";
import type { CollateralCheck } from "../types.js";

// SEP-1 v2.7.0 message template.
const TEMPLATE =
  /^The assets in the account (\S+) are reserved to back (\S+) issued by (\S+) on Stellar\. Valid from (\S+) to (\S+?)\.?$/;

function decodeSig(sig: string): Buffer | null {
  if (/^[0-9a-fA-F]{128}$/.test(sig)) return Buffer.from(sig, "hex");
  const b = Buffer.from(sig, "base64");
  return b.length === 64 ? b : null;
}

/** Pure check of one address/message/signature triple (no network). */
export function verifyCollateral(
  address: string,
  message: string | null,
  signature: string | null,
  asset: { code: string; issuer: string },
): Omit<CollateralCheck, "balances"> {
  const base = { address, message, valid_from: null, valid_to: null };
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return {
      ...base,
      chain: "other",
      signature_valid: null,
      message_matches_template: null,
      note: "signature not checked: unsupported chain",
    };
  }
  if (!message || !signature) {
    return {
      ...base,
      chain: "stellar",
      signature_valid: null,
      message_matches_template: null,
      note: "message or signature missing",
    };
  }
  const m = TEMPLATE.exec(message.trim());
  const matches = !!m && m[1] === address && m[2] === asset.code && m[3] === asset.issuer;
  const sig = decodeSig(signature.trim());
  let valid: boolean | null = null;
  let note: string | null = null;
  if (!sig) note = "signature encoding not recognised (expected base64 or hex, 64 bytes)";
  else valid = Keypair.fromPublicKey(address).verify(Buffer.from(message, "utf8"), sig);
  return {
    ...base,
    chain: "stellar",
    signature_valid: valid,
    message_matches_template: matches,
    valid_from: m?.[4] ?? null,
    valid_to: m?.[5] ?? null,
    note,
  };
}

export async function stellarBalances(
  f: Fetcher,
  address: string,
): Promise<{ asset: string; amount: string }[] | null> {
  try {
    const r = await f(`${HORIZON}/accounts/${address}`);
    if (!r.ok) return null;
    const a = (await r.json()) as {
      balances: {
        asset_type: string;
        asset_code?: string;
        asset_issuer?: string;
        balance: string;
      }[];
    };
    return a.balances.map((b) => ({
      asset: b.asset_type === "native" ? "XLM" : `${b.asset_code}-${b.asset_issuer}`,
      amount: b.balance,
    }));
  } catch {
    return null;
  }
}

export async function checkCollateral(
  f: Fetcher,
  fields: {
    collateral_addresses: string[];
    collateral_address_messages: string[];
    collateral_address_signatures: string[];
  },
  asset: { code: string; issuer: string },
): Promise<CollateralCheck[]> {
  const out: CollateralCheck[] = [];
  for (const [i, addr] of fields.collateral_addresses.entries()) {
    const v = verifyCollateral(
      addr,
      fields.collateral_address_messages[i] ?? null,
      fields.collateral_address_signatures[i] ?? null,
      asset,
    );
    out.push({ ...v, balances: v.chain === "stellar" ? await stellarBalances(f, addr) : null });
  }
  return out;
}

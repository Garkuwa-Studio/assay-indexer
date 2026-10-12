import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { verifyCollateral } from "../src/collateral/index.js";
import { ISSUER } from "./helpers.js";

const kp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9));
const msg = `The assets in the account ${kp.publicKey()} are reserved to back USDX issued by ${ISSUER} on Stellar. Valid from 2026-01-01 to 2026-12-31.`;
const asset = { code: "USDX", issuer: ISSUER };
// stellar-sdk 17 returns a Uint8Array from sign(); wrap it to encode.
const sign = (k: Keypair, m: string) => Buffer.from(k.sign(Buffer.from(m)));

describe("verifyCollateral", () => {
  it("accepts a valid base64 or hex signature over the SEP-1 message", () => {
    const sig = sign(kp, msg);
    for (const enc of [sig.toString("base64"), sig.toString("hex")]) {
      const r = verifyCollateral(kp.publicKey(), msg, enc, asset);
      expect(r.signature_valid).toBe(true);
      expect(r.message_matches_template).toBe(true);
      expect([r.valid_from, r.valid_to]).toEqual(["2026-01-01", "2026-12-31"]);
    }
  });
  it("rejects a signature by another key", () => {
    const other = sign(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)), msg).toString("base64");
    expect(verifyCollateral(kp.publicKey(), msg, other, asset).signature_valid).toBe(false);
  });
  it("flags a message that does not name this asset", () => {
    const sig = sign(kp, msg).toString("base64");
    expect(
      verifyCollateral(kp.publicKey(), msg, sig, { code: "OTHER", issuer: ISSUER })
        .message_matches_template,
    ).toBe(false);
  });
  it("does not check non-Stellar addresses", () => {
    const r = verifyCollateral("bc1qexampleaddress", msg, "x", asset);
    expect(r).toMatchObject({
      chain: "other",
      signature_valid: null,
      note: "signature not checked: unsupported chain",
    });
  });
});

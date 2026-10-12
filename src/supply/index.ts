import type { HorizonAsset } from "../census/horizon.js";

/** Parse a Horizon 7-decimal amount string into stroops. */
export function toStroops(amount: string | undefined): bigint {
  if (!amount) return 0n;
  const [whole = "0", frac = ""] = amount.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(frac.padEnd(7, "0").slice(0, 7));
}

export function fromStroops(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 10_000_000n}.${(a % 10_000_000n).toString().padStart(7, "0")}`;
}

/**
 * Supply of a classic asset from its Horizon record (assay/docs/STACK-STATUS.md §2):
 * trustline balances in every authorization state + claimable balances +
 * liquidity pools + Soroban contract balances.
 *
 * NOT PUBLISHED until reconciled with an independent source (D0 decision 3).
 */
export function supplyFromHorizon(a: HorizonAsset): bigint {
  const b = a.balances ?? {};
  return (
    toStroops(b.authorized) +
    toStroops(b.authorized_to_maintain_liabilities) +
    toStroops(b.unauthorized) +
    toStroops(a.claimable_balances_amount) +
    toStroops(a.liquidity_pools_amount) +
    toStroops(a.contracts_amount)
  );
}

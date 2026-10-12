import { describe, expect, it } from "vitest";
import type { HorizonAsset } from "../src/census/horizon.js";
import { fromStroops, supplyFromHorizon, toStroops } from "../src/supply/index.js";
import { fixture } from "./helpers.js";

describe("supply formula", () => {
  it("parses 7-decimal amounts exactly", () => {
    expect(toStroops("1.0000001")).toBe(10_000_001n);
    expect(toStroops("0.5")).toBe(5_000_000n);
    expect(toStroops(undefined)).toBe(0n);
    expect(fromStroops(3761127995771581n)).toBe("376112799.5771581");
  });
  it("sums every holding type (recorded USDC record, D0 cross-check value)", () => {
    const a = JSON.parse(fixture("horizon-usdc-asset.json").toString()) as HorizonAsset;
    expect(fromStroops(supplyFromHorizon(a))).toBe("376112799.5771581");
  });
});

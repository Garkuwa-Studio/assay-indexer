import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadManual, manualToStated } from "../src/manual/index.js";
import { ISSUER } from "./helpers.js";

const entry = `
asset: BOND-${ISSUER}
source_url: https://example.org/report.pdf
page: 3
transcribed_on: 2026-10-12
transcriber: test-transcriber
as_of: 2026-09-30
reserves:
  - { type: government_bond, amount: "1250000.00", unit: MXN }
liabilities: { supply: "1000000", unit: MXN }
`;

const dirWith = (content: string) => {
  const d = mkdtempSync(join(tmpdir(), "manual-"));
  writeFileSync(join(d, "entry.yaml"), content);
  return d;
};

describe("manual transcriptions", () => {
  it("loads a complete entry and marks it manual", () => {
    const m = loadManual(dirWith(entry));
    const s = manualToStated(m.get(`BOND-${ISSUER}`)!);
    expect(s.source).toBe("manual");
    expect(s.manual).toEqual({
      source_url: "https://example.org/report.pdf",
      page: "3",
      transcribed_on: "2026-10-12",
      transcriber: "test-transcriber",
    });
  });
  it.each(["source_url", "page", "transcribed_on", "transcriber"])(
    "fails the run when %s is missing",
    (field) => {
      const without = entry
        .split("\n")
        .filter((l) => !l.startsWith(`${field}:`))
        .join("\n");
      expect(() => loadManual(dirWith(without))).toThrow(field);
    },
  );
  it("returns an empty map when the directory is missing", () => {
    expect(loadManual("/nonexistent/dir").size).toBe(0);
  });
});

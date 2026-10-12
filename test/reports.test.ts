import { describe, expect, it } from "vitest";
import { checkReport } from "../src/reports/index.js";
import { parsePdfDate } from "../src/reports/pdf.js";
import { parseStructured } from "../src/reports/structured.js";
import { errors, fixture, fixtureFetcher, ISSUER } from "./helpers.js";

const U = "https://example.org/r";
const now = () => new Date("2026-10-12T00:00:00Z");

describe("checkReport", () => {
  it("hashes the body and records headers", async () => {
    const f = fixtureFetcher({
      [U]: {
        body: "<!doctype html><p>Reserves</p>",
        headers: { "content-type": "text/html", "last-modified": "Mon, 12 Oct 2026 13:28:20 GMT" },
      },
    });
    const r = await checkReport(f, U, now);
    expect(r.kind).toBe("html");
    expect(r.link.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.link.size_bytes).toBe(30);
    expect(r.link.last_modified).toBe("Mon, 12 Oct 2026 13:28:20 GMT");
    expect(r.link.error_kind).toBeNull();
  });
  it("keeps 403 distinct from 404 (D0: Cloudflare 403s)", async () => {
    const r403 = await checkReport(fixtureFetcher({ [U]: { status: 403, body: "" } }), U, now);
    const r404 = await checkReport(fixtureFetcher({ [U]: { status: 404, body: "" } }), U, now);
    expect(r403.link.error_kind).toBe("blocked_403");
    expect(r404.link.error_kind).toBe("http_4xx");
  });
  it("records redirect loops and timeouts (D0: 308 loop)", async () => {
    expect(
      (await checkReport(fixtureFetcher({ [U]: { throws: errors.redirectLoop() } }), U, now)).link
        .error_kind,
    ).toBe("redirect_loop");
    expect(
      (await checkReport(fixtureFetcher({ [U]: { throws: errors.timeout() } }), U, now)).link
        .error_kind,
    ).toBe("timeout");
  });
  it("reads the document date from PDF metadata", async () => {
    const r = await checkReport(
      fixtureFetcher({
        [U]: {
          body: new Uint8Array(fixture("report.pdf")),
          headers: { "content-type": "application/pdf" },
        },
      }),
      U,
      now,
    );
    expect(r.kind).toBe("pdf");
    expect(r.pdf_date).toBe("2026-10-01T09:00:00.000Z"); // ModDate preferred over CreationDate
  });
  it("returns parsed JSON for structured reports", async () => {
    const r = await checkReport(
      fixtureFetcher({
        [U]: {
          body: fixture("reserves.json").toString(),
          headers: { "content-type": "application/json" },
        },
      }),
      U,
      now,
    );
    expect(r.kind).toBe("json");
    expect(parseStructured(r.json, "USDX", ISSUER)?.as_of).toBe("2026-09-30T23:59:59Z");
  });
});

describe("parseStructured", () => {
  const json = JSON.parse(fixture("reserves.json").toString());
  it("rejects a report for a different asset", () => {
    expect(parseStructured(json, "USDX", "GOTHER")).toBeNull();
  });
  it("rejects JSON that is not reserve-report-v0", () => {
    expect(parseStructured({ ...json, sep: "something-else" }, "USDX", ISSUER)).toBeNull();
    expect(parseStructured({ reserves: 1 }, "USDX", ISSUER)).toBeNull();
  });
});

describe("parsePdfDate", () => {
  it("parses PDF date strings", () => {
    expect(parsePdfDate("D:20260930120000Z")).toBe("2026-09-30T12:00:00.000Z");
    expect(parsePdfDate("D:20260930120000+01'00'")).toBe("2026-09-30T11:00:00.000Z");
    expect(parsePdfDate("garbage")).toBeNull();
  });
});

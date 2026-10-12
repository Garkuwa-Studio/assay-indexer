import { describe, expect, it } from "vitest";
import { classifyError, classifyStatus, politeFetcher, USER_AGENT } from "../src/http.js";
import { errors } from "./helpers.js";

describe("classify", () => {
  it("maps statuses", () => {
    expect(classifyStatus(200)).toBeNull();
    expect(classifyStatus(403)).toBe("blocked_403");
    expect(classifyStatus(404)).toBe("http_4xx");
    expect(classifyStatus(503)).toBe("http_5xx");
  });
  it("maps thrown errors", () => {
    expect(classifyError(errors.timeout()).kind).toBe("timeout");
    expect(classifyError(errors.redirectLoop()).kind).toBe("redirect_loop");
    expect(classifyError(errors.dns()).kind).toBe("dns");
    expect(classifyError(errors.tls()).kind).toBe("tls");
    expect(classifyError(new Error("socket hang up")).kind).toBe("network");
  });
});

describe("politeFetcher", () => {
  it("spaces requests to the same host and sends the User-Agent", async () => {
    const sleeps: number[] = [];
    const seen: Record<string, string>[] = [];
    const f = politeFetcher({
      perHostIntervalMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetch: async (_u, init) => {
        seen.push(init?.headers as Record<string, string>);
        return new Response("ok");
      },
    });
    await Promise.all([
      f("https://a.example/1"),
      f("https://a.example/2"),
      f("https://b.example/1"),
    ]);
    expect(sleeps.length).toBe(1); // only the second a.example request waits
    expect(sleeps[0]).toBeGreaterThan(900);
    expect(seen.every((h) => h["user-agent"] === USER_AGENT)).toBe(true);
  });
});

describe("getWithRetry", async () => {
  const { getWithRetry } = await import("../src/census/horizon.js");
  const noSleep = async () => {};
  it("retries 429 and 5xx, then succeeds", async () => {
    const statuses = [429, 503, 200];
    const f = async () => {
      const s = statuses.shift()!;
      return new Response(s === 200 ? '{"ok":1}' : "", { status: s });
    };
    expect(await getWithRetry(f, "https://h.example/x", 5, noSleep)).toEqual({ ok: 1 });
  });
  it("does not retry a 404", async () => {
    let n = 0;
    const f = async () => {
      n++;
      return new Response("", { status: 404 });
    };
    await expect(getWithRetry(f, "https://h.example/x", 5, noSleep)).rejects.toThrow("HTTP 404");
    expect(n).toBe(1);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Fetcher } from "../src/http.js";

export const ISSUER = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
export const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name));

export type Route =
  | { status?: number; body: string | Uint8Array | object; headers?: Record<string, string> }
  | { throws: Error };

/** A Fetcher that only serves recorded fixtures. Unknown URLs fail the test. */
export function fixtureFetcher(routes: Record<string, Route>): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error(`unexpected network call in test: ${url}`);
    if ("throws" in r) throw r.throws;
    const body =
      typeof r.body === "string" || r.body instanceof Uint8Array ? r.body : JSON.stringify(r.body);
    const res = new Response(body as BodyInit, {
      status: r.status ?? 200,
      headers: r.headers ?? {},
    });
    Object.defineProperty(res, "url", { value: url });
    return res;
  }) as Fetcher & { calls: string[] };
  f.calls = calls;
  return f;
}

/** Shapes of errors Node's fetch (undici) throws. */
export const errors = {
  timeout: () =>
    Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }),
  redirectLoop: () =>
    new TypeError("fetch failed", { cause: new Error("redirect count exceeded") }),
  dns: () =>
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("getaddrinfo ENOTFOUND gone.example"), { code: "ENOTFOUND" }),
    }),
  tls: () =>
    new TypeError("fetch failed", {
      cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
    }),
};

import type { FetchErrorKind } from "./types.js";

export const USER_AGENT = "AssayIndexer/0.1 (+https://github.com/Garkuwa-Studio/assay-indexer)";

/** The fetch signature the indexer depends on; tests inject a fixture-backed one. */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface PoliteOptions {
  /** Minimum gap between requests to the same host. */
  perHostIntervalMs?: number;
  /** Maximum requests in flight across all hosts. */
  concurrency?: number;
  timeoutMs?: number;
  /** Base fetch; defaults to global fetch. */
  fetch?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Wraps fetch with a per-host rate limit, a global concurrency cap, a timeout
 * and an identifying User-Agent. Public data only; nothing is logged here.
 */
export function politeFetcher(opts: PoliteOptions = {}): Fetcher {
  const interval = opts.perHostIntervalMs ?? 1000;
  const concurrency = opts.concurrency ?? 6;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const base = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const nextSlot = new Map<string, number>();
  let active = 0;
  const waiters: (() => void)[] = [];

  const acquire = async () => {
    if (active < concurrency) {
      active++;
      return;
    }
    await new Promise<void>((r) => waiters.push(r));
    active++;
  };
  const release = () => {
    active--;
    waiters.shift()?.();
  };

  return async (url, init = {}) => {
    const host = new URL(url).host;
    const now = Date.now();
    const slot = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, slot + interval);
    if (slot > now) await sleep(slot - now);

    await acquire();
    try {
      return await base(url, {
        redirect: "follow",
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, ...(init.headers as Record<string, string>) },
      });
    } finally {
      release();
    }
  };
}

/** Classify a thrown fetch error or a non-OK status. */
export function classifyError(e: unknown): { kind: FetchErrorKind; message: string } {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const message = [err?.message, err?.cause?.message].filter(Boolean).join(": ") || String(e);
  const code = err?.cause?.code ?? "";
  if (err?.name === "TimeoutError" || err?.name === "AbortError")
    return { kind: "timeout", message };
  if (/redirect/i.test(message)) return { kind: "redirect_loop", message };
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /ENOTFOUND/.test(message))
    return { kind: "dns", message };
  if (/CERT|certificate|SSL|TLS/i.test(code + message)) return { kind: "tls", message };
  return { kind: "network", message };
}

export function classifyStatus(status: number): FetchErrorKind | null {
  if (status >= 200 && status < 300) return null;
  if (status === 403) return "blocked_403";
  if (status >= 500) return "http_5xx";
  return "http_4xx";
}

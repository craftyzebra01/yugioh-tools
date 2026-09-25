/**
 * Thin HTTP helpers for YGOPRODeck API v7.
 * Respect 20 req/s; prefer bulk dumps over per-card live calls.
 */

export const YGOPRODECK_CARDINFO_TCG =
  "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg";
export const YGOPRODECK_CHECK_DB_VER =
  "https://db.ygoprodeck.com/api/v7/checkDBVer.php";

/** Stay under the documented 20 req/s ceiling with margin. */
export const DEFAULT_MIN_INTERVAL_MS = 100;

export class RateLimiter {
  private nextAllowedAt = 0;

  constructor(private readonly minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAt - now);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.minIntervalMs;
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchJsonOptions {
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
  /** Extra query params merged into the URL */
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
}

export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const limiter = options.rateLimiter ?? new RateLimiter();
  await limiter.wait();

  let finalUrl = url;
  if (options.searchParams) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(options.searchParams)) {
      u.searchParams.set(k, v);
    }
    finalUrl = u.toString();
  }

  const res = await fetch(finalUrl, {
    signal: options.signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "yugioh-tools/0.1 (card-data-ingest; +https://github.com/craftyzebra01/yugioh-tools)",
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new HttpError(
      `YGOPRODeck request failed: ${res.status} ${res.statusText}`,
      res.status,
      finalUrl,
    );
  }

  return (await res.json()) as T;
}

export async function fetchBinary(
  url: string,
  options: { rateLimiter?: RateLimiter; signal?: AbortSignal } = {},
): Promise<Uint8Array> {
  const limiter = options.rateLimiter ?? new RateLimiter();
  await limiter.wait();

  const res = await fetch(url, {
    signal: options.signal,
    headers: {
      "User-Agent": "yugioh-tools/0.1 (card-data-ingest; +https://github.com/craftyzebra01/yugioh-tools)",
    },
  });

  if (!res.ok) {
    throw new HttpError(
      `Image download failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
    );
  }

  return new Uint8Array(await res.arrayBuffer());
}

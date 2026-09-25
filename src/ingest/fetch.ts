import type { DbVersionInfo } from "../cards/types.js";
import {
  YGOPRODECK_CARDINFO_TCG,
  YGOPRODECK_CHECK_DB_VER,
  fetchJson,
  RateLimiter,
} from "./http.js";
import type { YgoProDeckCardInfoResponse } from "../cards/normalize.js";

export interface FetchTcgCorpusOptions {
  /** Include misc_info (tcg_date, konami_id, formats). Default true. */
  misc?: boolean;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
}

/** Single bulk dump of TCG English cards — preferred over live per-query matching. */
export async function fetchTcgCorpus(
  options: FetchTcgCorpusOptions = {},
): Promise<YgoProDeckCardInfoResponse> {
  const misc = options.misc ?? true;
  const searchParams = misc ? { misc: "yes" } : undefined;
  return fetchJson<YgoProDeckCardInfoResponse>(YGOPRODECK_CARDINFO_TCG, {
    rateLimiter: options.rateLimiter,
    signal: options.signal,
    searchParams,
  });
}

/**
 * checkDBVer.php returns an array with one object:
 * [{ "database_version": "147.07", "last_update": "2026-09-23 ..." }]
 */
export async function fetchDbVersion(
  options: { rateLimiter?: RateLimiter; signal?: AbortSignal } = {},
): Promise<DbVersionInfo> {
  const raw = await fetchJson<DbVersionInfo[] | DbVersionInfo>(
    YGOPRODECK_CHECK_DB_VER,
    {
      rateLimiter: options.rateLimiter,
      signal: options.signal,
    },
  );

  const info = Array.isArray(raw) ? raw[0] : raw;
  if (!info?.database_version || !info?.last_update) {
    throw new Error("Unexpected checkDBVer.php response shape");
  }
  return {
    database_version: String(info.database_version),
    last_update: String(info.last_update),
  };
}

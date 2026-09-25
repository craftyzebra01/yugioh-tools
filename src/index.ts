export type { Card, CardCache, CacheMeta, BanlistInfo, DbVersionInfo } from "./cards/types.js";
export {
  loadCardsForMatching,
  readCardCache,
  readCacheMeta,
  writeCardCache,
  DEFAULT_CACHE_DIR,
} from "./cards/cache.js";
export { normalizeCard, normalizeCorpus } from "./cards/normalize.js";
export { ingestTcgCache, refreshIfNeeded } from "./ingest/ingest.js";
export { fetchDbVersion, fetchTcgCorpus } from "./ingest/fetch.js";
export { downloadCardImages } from "./ingest/images.js";
export {
  parsePullClauses,
  parseTargetCriteria,
  cardMatchesCriteria,
  searchCardsByName,
  findPullMatches,
  findPullMatchesById,
} from "./matcher/index.js";
export type {
  PullClause,
  PullMatch,
  MatchResult,
  PullCriteria,
  NameSearchHit,
} from "./matcher/index.js";
export { createMatcherApp } from "./web/server.js";

import type { CacheMeta, Card, CardCache, DbVersionInfo } from "../cards/types.js";
import { normalizeCorpus } from "../cards/normalize.js";
import { writeCardCache, readCacheMeta, DEFAULT_CACHE_DIR } from "../cards/cache.js";
import { fetchDbVersion, fetchTcgCorpus } from "./fetch.js";
import { downloadCardImages, DEFAULT_IMAGES_DIR } from "./images.js";
import { RateLimiter } from "./http.js";
import type { ImageSize } from "./images.js";

export interface IngestOptions {
  cacheDir?: string;
  imagesDir?: string;
  misc?: boolean;
  /** Download and re-host images. Default false (data-only ingest). */
  downloadImages?: boolean;
  imageSizes?: ImageSize[];
  /** Cap image downloads (smoke / partial). */
  imageLimit?: number;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
  /** Force ingest even if database_version matches cached meta. */
  force?: boolean;
  onLog?: (message: string) => void;
}

export interface IngestResult {
  cache: CardCache;
  skipped: boolean;
  dbVersion: DbVersionInfo;
  imageStats?: { downloaded: number; skipped: number; failed: number };
}

function buildMeta(
  db: DbVersionInfo,
  cards: Card[],
  miscIncluded: boolean,
  imagesDownloaded: boolean,
): CacheMeta {
  return {
    source: "ygoprodeck-api-v7",
    databaseVersion: db.database_version,
    lastUpdate: db.last_update,
    ingestedAt: new Date().toISOString(),
    format: "tcg",
    cardCount: cards.length,
    miscIncluded,
    imagesDownloaded,
  };
}

/**
 * Ingest TCG corpus from YGOPRODeck into local cache.
 * Matching must use this cache — never live API per user search.
 */
export async function ingestTcgCache(
  options: IngestOptions = {},
): Promise<IngestResult> {
  const log = options.onLog ?? ((m: string) => console.log(m));
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const misc = options.misc ?? true;
  const limiter = options.rateLimiter ?? new RateLimiter();

  log("Checking YGOPRODeck database version…");
  const dbVersion = await fetchDbVersion({
    rateLimiter: limiter,
    signal: options.signal,
  });
  log(`Remote DB version=${dbVersion.database_version} last_update=${dbVersion.last_update}`);

  if (!options.force) {
    const existing = await readCacheMeta(cacheDir);
    if (
      existing &&
      existing.databaseVersion === dbVersion.database_version &&
      existing.format === "tcg"
    ) {
      log(
        `Cache already at database_version=${existing.databaseVersion}; skipping ingest (use --force to rebuild).`,
      );
      const { readCardCache } = await import("../cards/cache.js");
      const cache = await readCardCache(cacheDir);
      return { cache, skipped: true, dbVersion };
    }
  }

  log("Fetching TCG cardinfo dump (format=tcg)…");
  const response = await fetchTcgCorpus({
    misc,
    rateLimiter: limiter,
    signal: options.signal,
  });

  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error("cardinfo.php returned no cards");
  }

  log(`Received ${response.data.length} raw cards; normalizing…`);
  const cards = normalizeCorpus(response.data);
  log(`Normalized ${cards.length} cards (junk filtered).`);

  const withDesc = cards.filter((c) => typeof c.desc === "string" && c.desc.length > 0);
  if (withDesc.length < cards.length * 0.9) {
    throw new Error(
      `Sanity check failed: only ${withDesc.length}/${cards.length} cards have desc/effect text`,
    );
  }

  let imageStats: IngestResult["imageStats"];
  let imagesDownloaded = false;

  if (options.downloadImages) {
    log("Downloading card images for local re-host (do not hotlink)…");
    imageStats = await downloadCardImages(cards, {
      imagesDir: options.imagesDir ?? DEFAULT_IMAGES_DIR,
      sizes: options.imageSizes ?? ["small"],
      rateLimiter: limiter,
      signal: options.signal,
      limit: options.imageLimit,
      onProgress: (done, total) => {
        if (done === total || done % 50 === 0) {
          log(`  images ${done}/${total}`);
        }
      },
    });
    imagesDownloaded = true;
    log(
      `Images: downloaded=${imageStats.downloaded} skipped=${imageStats.skipped} failed=${imageStats.failed}`,
    );
  }

  const meta = buildMeta(dbVersion, cards, misc, imagesDownloaded);
  const cache = await writeCardCache(cards, meta, cacheDir);
  log(
    `Wrote cache: ${cacheDir} (version=${meta.databaseVersion}, cards=${meta.cardCount})`,
  );

  return { cache, skipped: false, dbVersion, imageStats };
}

/**
 * Refresh if remote database_version (or last_update) differs from local meta.
 */
export async function refreshIfNeeded(
  options: IngestOptions = {},
): Promise<IngestResult> {
  return ingestTcgCache({ ...options, force: options.force ?? false });
}

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { Card, CardCache, CacheMeta } from "./types.js";

export const DEFAULT_CACHE_DIR = path.resolve("data/cache");
export const CARDS_FILENAME = "cards.json";
export const META_FILENAME = "meta.json";
export const INDEX_BY_ID_FILENAME = "by-id.json";

export function cardsPath(cacheDir: string = DEFAULT_CACHE_DIR): string {
  return path.join(cacheDir, CARDS_FILENAME);
}

export function metaPath(cacheDir: string = DEFAULT_CACHE_DIR): string {
  return path.join(cacheDir, META_FILENAME);
}

export async function ensureCacheDir(cacheDir: string = DEFAULT_CACHE_DIR): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
}

/** Atomic-ish write: write temp then rename. */
async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(tmp, filePath);
}

export async function writeCardCache(
  cards: Card[],
  meta: CacheMeta,
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<CardCache> {
  await ensureCacheDir(cacheDir);
  const payload: CardCache = { meta, cards };
  await writeJsonAtomic(cardsPath(cacheDir), payload);
  await writeJsonAtomic(metaPath(cacheDir), meta);

  const byId: Record<string, number> = {};
  for (let i = 0; i < cards.length; i++) {
    byId[String(cards[i]!.id)] = i;
  }
  await writeJsonAtomic(path.join(cacheDir, INDEX_BY_ID_FILENAME), byId);

  return payload;
}

export async function readCardCache(
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<CardCache> {
  const raw = await readFile(cardsPath(cacheDir), "utf8");
  const parsed = JSON.parse(raw) as CardCache;
  if (!parsed?.meta || !Array.isArray(parsed.cards)) {
    throw new Error(`Invalid card cache at ${cardsPath(cacheDir)}`);
  }
  return parsed;
}

export async function readCacheMeta(
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<CacheMeta | null> {
  try {
    const raw = await readFile(metaPath(cacheDir), "utf8");
    return JSON.parse(raw) as CacheMeta;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

/** Load cache for matching / name search — never hits live YGOPRODeck. */
export async function loadCardsForMatching(
  cacheDir: string = DEFAULT_CACHE_DIR,
): Promise<Card[]> {
  const cache = await readCardCache(cacheDir);
  return cache.cards;
}

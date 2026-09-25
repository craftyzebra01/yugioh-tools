/**
 * Internal card schema used by matching (offline cache).
 * Sourced from YGOPRODeck API v7; normalized for TCG English pool.
 */

export interface BanlistInfo {
  ban_tcg?: string;
  ban_ocg?: string;
  ban_goat?: string;
}

/** Local image paths after re-host download; URLs are never hotlinked at runtime. */
export interface CardImageRefs {
  /** Passcode / image id from YGOPRODeck */
  id: number;
  /** Relative path under data/images, e.g. "full/46986414.jpg" */
  full?: string;
  small?: string;
  cropped?: string;
  /** Upstream URLs kept only for ingest refresh — do not serve these to clients. */
  source?: {
    full?: string;
    small?: string;
    cropped?: string;
  };
}

export interface CardMiscInfo {
  tcg_date?: string;
  konami_id?: number;
  formats?: string[];
}

/**
 * Normalized card record for offline name search + pull matching.
 * Banlist is stored for later use but must not filter v1 UI.
 */
export interface Card {
  id: number;
  name: string;
  /** Full English effect / lore text — primary input for pull matching. */
  desc: string;
  type: string;
  frameType?: string;
  race?: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  banlist?: BanlistInfo;
  images: CardImageRefs[];
  misc?: CardMiscInfo;
}

export interface CacheMeta {
  source: "ygoprodeck-api-v7";
  /** YGOPRODeck `database_version` at ingest time */
  databaseVersion: string;
  lastUpdate: string;
  ingestedAt: string;
  format: "tcg";
  cardCount: number;
  miscIncluded: boolean;
  imagesDownloaded: boolean;
}

export interface CardCache {
  meta: CacheMeta;
  cards: Card[];
}

export interface DbVersionInfo {
  database_version: string;
  last_update: string;
}

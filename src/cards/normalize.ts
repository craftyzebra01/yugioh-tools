import type { BanlistInfo, Card, CardImageRefs, CardMiscInfo } from "./types.js";

/** Minimal YGOPRODeck cardinfo.php shape we care about. */
export interface YgoProDeckCard {
  id: number;
  name: string;
  type: string;
  frameType?: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race?: string;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  banlist_info?: BanlistInfo;
  card_images?: Array<{
    id: number;
    image_url?: string;
    image_url_small?: string;
    image_url_cropped?: string;
  }>;
  misc_info?: Array<{
    tcg_date?: string;
    konami_id?: number;
    formats?: string[];
  }>;
}

export interface YgoProDeckCardInfoResponse {
  data: YgoProDeckCard[];
}

/**
 * Known non-game / placeholder names sometimes present in dumps.
 * Extend as needed; empty desc alone is not junk (Normal Monster lore can be short).
 */
const JUNK_NAME_PATTERNS: RegExp[] = [
  /^token$/i,
  /^test\b/i,
];

export function isLikelyJunkCard(raw: YgoProDeckCard): boolean {
  if (!raw.name?.trim() || !Number.isFinite(raw.id)) return true;
  return JUNK_NAME_PATTERNS.some((re) => re.test(raw.name.trim()));
}

function normalizeMisc(raw: YgoProDeckCard): CardMiscInfo | undefined {
  const first = raw.misc_info?.[0];
  if (!first) return undefined;
  const misc: CardMiscInfo = {};
  if (first.tcg_date) misc.tcg_date = first.tcg_date;
  if (typeof first.konami_id === "number") misc.konami_id = first.konami_id;
  if (Array.isArray(first.formats) && first.formats.length > 0) {
    misc.formats = [...first.formats];
  }
  return Object.keys(misc).length > 0 ? misc : undefined;
}

function normalizeImages(raw: YgoProDeckCard): CardImageRefs[] {
  if (!raw.card_images?.length) return [];
  return raw.card_images.map((img) => ({
    id: img.id,
    source: {
      full: img.image_url,
      small: img.image_url_small,
      cropped: img.image_url_cropped,
    },
  }));
}

/** Map one YGOPRODeck card into the internal schema. */
export function normalizeCard(raw: YgoProDeckCard): Card {
  const card: Card = {
    id: raw.id,
    name: raw.name.trim(),
    desc: typeof raw.desc === "string" ? raw.desc : "",
    type: raw.type,
    images: normalizeImages(raw),
  };

  if (raw.frameType) card.frameType = raw.frameType;
  if (raw.race) card.race = raw.race;
  if (raw.attribute) card.attribute = raw.attribute;
  if (typeof raw.level === "number") card.level = raw.level;
  if (typeof raw.atk === "number") card.atk = raw.atk;
  if (typeof raw.def === "number") card.def = raw.def;
  if (raw.archetype) card.archetype = raw.archetype;
  if (typeof raw.scale === "number") card.scale = raw.scale;
  if (typeof raw.linkval === "number") card.linkval = raw.linkval;
  if (raw.linkmarkers?.length) card.linkmarkers = [...raw.linkmarkers];
  if (raw.banlist_info) card.banlist = { ...raw.banlist_info };

  const misc = normalizeMisc(raw);
  if (misc) card.misc = misc;

  return card;
}

/** Normalize and drop known junk; preserves banlist for later (do not filter on it). */
export function normalizeCorpus(rawCards: YgoProDeckCard[]): Card[] {
  const out: Card[] = [];
  for (const raw of rawCards) {
    if (isLikelyJunkCard(raw)) continue;
    out.push(normalizeCard(raw));
  }
  return out;
}

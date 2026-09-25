import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  normalizeCard,
  normalizeCorpus,
  isLikelyJunkCard,
  type YgoProDeckCard,
} from "../src/cards/normalize.js";
import { writeCardCache, readCardCache, loadCardsForMatching } from "../src/cards/cache.js";
import type { CacheMeta } from "../src/cards/types.js";

const sampleRaw: YgoProDeckCard = {
  id: 46986414,
  name: "Dark Magician",
  type: "Normal Monster",
  frameType: "normal",
  desc: "The ultimate wizard in terms of attack and defense.",
  atk: 2500,
  def: 2100,
  level: 7,
  race: "Spellcaster",
  attribute: "DARK",
  archetype: "Dark Magician",
  banlist_info: { ban_tcg: "Limited" },
  card_images: [
    {
      id: 46986414,
      image_url: "https://images.ygoprodeck.com/images/cards/46986414.jpg",
      image_url_small: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      image_url_cropped: "https://images.ygoprodeck.com/images/cards_cropped/46986414.jpg",
    },
  ],
  misc_info: [
    {
      tcg_date: "2002-03-08",
      konami_id: 4041,
      formats: ["TCG", "OCG"],
    },
  ],
};

describe("normalizeCard", () => {
  it("maps YGOPRODeck fields into internal schema with full desc", () => {
    const card = normalizeCard(sampleRaw);
    assert.equal(card.id, 46986414);
    assert.equal(card.name, "Dark Magician");
    assert.equal(card.desc, sampleRaw.desc);
    assert.equal(card.type, "Normal Monster");
    assert.equal(card.race, "Spellcaster");
    assert.equal(card.attribute, "DARK");
    assert.equal(card.level, 7);
    assert.equal(card.atk, 2500);
    assert.equal(card.def, 2100);
    assert.equal(card.archetype, "Dark Magician");
    assert.deepEqual(card.banlist, { ban_tcg: "Limited" });
    assert.equal(card.misc?.konami_id, 4041);
    assert.equal(card.images[0]?.source?.full?.includes("46986414"), true);
  });

  it("stores banlist but corpus normalize does not drop banned cards", () => {
    const cards = normalizeCorpus([sampleRaw]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0]!.banlist?.ban_tcg, "Limited");
  });

  it("filters likely junk names", () => {
    assert.equal(isLikelyJunkCard({ ...sampleRaw, name: "Token" }), true);
    assert.equal(isLikelyJunkCard(sampleRaw), false);
  });
});

describe("card cache", () => {
  it("round-trips cards.json with meta and usable desc for matching", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ygo-cache-"));
    try {
      const cards = normalizeCorpus([sampleRaw]);
      const meta: CacheMeta = {
        source: "ygoprodeck-api-v7",
        databaseVersion: "147.07",
        lastUpdate: "2026-09-23",
        ingestedAt: new Date().toISOString(),
        format: "tcg",
        cardCount: cards.length,
        miscIncluded: true,
        imagesDownloaded: false,
      };
      await writeCardCache(cards, meta, dir);
      const loaded = await readCardCache(dir);
      assert.equal(loaded.meta.databaseVersion, "147.07");
      assert.equal(loaded.cards[0]!.desc.length > 0, true);

      const forMatching = await loadCardsForMatching(dir);
      assert.equal(forMatching.length, 1);
      assert.match(forMatching[0]!.desc, /wizard/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

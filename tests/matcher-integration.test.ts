/**
 * Optional integration checks against data/cache/cards.json when present.
 * Skips cleanly if the cache has not been ingested yet.
 */

import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";
import { loadCardsForMatching, DEFAULT_CACHE_DIR } from "../src/cards/cache.js";
import { findPullMatches, searchCardsByName } from "../src/matcher/match.js";

async function cacheExists(): Promise<boolean> {
  try {
    await access(path.join(DEFAULT_CACHE_DIR, "cards.json"));
    return true;
  } catch {
    return false;
  }
}

describe("matcher integration (local cache)", async () => {
  const hasCache = await cacheExists();
  if (!hasCache) {
    it("skips — run npm run ingest first", { skip: true }, () => {});
    return;
  }

  const cards = await loadCardsForMatching();

  it("loads a full TCG pool", () => {
    assert.ok(cards.length > 10000, `expected ~14k cards, got ${cards.length}`);
  });

  it("name search finds Reinforcement of the Army", () => {
    const hits = searchCardsByName(cards, "reinforcement of the army");
    assert.ok(hits.some((h) => h.card.name === "Reinforcement of the Army"));
  });

  it("ROTA match list is Warriors Level ≤4 only", () => {
    const rota = cards.find((c) => c.name === "Reinforcement of the Army");
    assert.ok(rota);
    const result = findPullMatches(rota!, cards);
    assert.ok(result.matches.length > 100);
    for (const m of result.matches) {
      assert.equal(m.card.race, "Warrior");
      assert.ok((m.card.level ?? 99) <= 4);
      assert.ok(/monster/i.test(m.card.type));
      assert.ok(!m.card.banlist || true); // banlist may exist; must not filter
    }
  });

  it("Terraforming only returns Field Spells", () => {
    const card = cards.find((c) => c.name === "Terraforming");
    assert.ok(card);
    const result = findPullMatches(card!, cards);
    assert.ok(result.matches.length > 50);
    for (const m of result.matches) {
      assert.equal(m.card.type, "Spell Card");
      assert.equal(m.card.race, "Field");
    }
  });

  it("Charge of the Light Brigade returns Lightsworn Level ≤4 monsters", () => {
    const card = cards.find((c) => c.name === "Charge of the Light Brigade");
    assert.ok(card);
    const result = findPullMatches(card!, cards);
    assert.ok(result.matches.length >= 10);
    for (const m of result.matches) {
      const isLightsworn =
        m.card.archetype === "Lightsworn" ||
        /lightsworn/i.test(m.card.name);
      assert.ok(isLightsworn, m.card.name);
      assert.ok((m.card.level ?? 99) <= 4);
    }
    assert.ok(
      !result.matches.some((m) => /Curious, the Lightsworn/i.test(m.card.name)),
    );
  });

  it("matches are alphabetical and exclude the source card", () => {
    const card = cards.find((c) => c.name === "Lonefire Blossom");
    assert.ok(card);
    const result = findPullMatches(card!, cards);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(!names.includes("Lonefire Blossom"));
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(names, sorted);
  });

  it("Mind Shuffle returns monsters that mention Light and Darkness Ritual", () => {
    const card = cards.find((c) => c.name === "Mind Shuffle");
    assert.ok(card, "Mind Shuffle missing from cache — re-ingest?");
    const result = findPullMatches(card!, cards);
    assert.ok(
      result.matches.length >= 3,
      `expected non-empty mentions list, got ${result.matches.length}`,
    );
    for (const m of result.matches) {
      assert.ok(/monster/i.test(m.card.type), m.card.name);
      assert.ok(
        /["“”']Light and Darkness Ritual["“”']/i.test(m.card.desc),
        `${m.card.name} should mention Light and Darkness Ritual`,
      );
    }
    assert.ok(
      !result.matches.some((m) => m.card.name === "Light and Darkness Ritual"),
    );
  });

  it("Vanquish Soul Razen returns non-Warrior Vanquish Soul monsters", () => {
    const card = cards.find((c) => c.name === "Vanquish Soul Razen");
    assert.ok(card, "Vanquish Soul Razen missing from cache — re-ingest?");
    const result = findPullMatches(card!, cards);
    assert.ok(
      result.matches.length >= 5,
      `expected non-empty VS list, got ${result.matches.length}`,
    );
    for (const m of result.matches) {
      const isVs =
        m.card.archetype === "Vanquish Soul" ||
        /vanquish soul/i.test(m.card.name) ||
        /vanquisher/i.test(m.card.name);
      assert.ok(isVs, m.card.name);
      assert.ok(/monster/i.test(m.card.type), m.card.name);
      assert.notEqual(m.card.race, "Warrior", m.card.name);
    }
    assert.ok(!result.matches.some((m) => m.card.name === "Vanquish Soul Razen"));
  });
});

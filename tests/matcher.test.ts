import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePullClauses,
  parseTargetCriteria,
} from "../src/matcher/parse.js";
import { cardMatchesCriteria } from "../src/matcher/criteria.js";
import {
  findPullMatches,
  searchCardsByName,
  clauseIsMatchable,
} from "../src/matcher/match.js";
import type { Card } from "../src/cards/types.js";
import { MINI_POOL, SEARCHER_FIXTURES } from "./fixtures/searchers.js";

describe("parseTargetCriteria", () => {
  it("parses Level 4 or lower Warrior monster", () => {
    const c = parseTargetCriteria("Level 4 or lower Warrior monster");
    assert.deepEqual(c.levels, [{ op: "lte", value: 4 }]);
    assert.deepEqual(c.races, ["Warrior"]);
    assert.ok(c.kinds?.includes("monster"));
  });

  it("parses Field Spell", () => {
    const c = parseTargetCriteria("Field Spell");
    assert.ok(c.kinds?.includes("field_spell"));
  });

  it("parses archetype quotes", () => {
    const c = parseTargetCriteria('"Predaplant" monster');
    assert.deepEqual(c.archetypes, ["Predaplant"]);
  });

  it("parses ATK ceiling", () => {
    const c = parseTargetCriteria("monster with 1500 or less ATK");
    assert.deepEqual(c.atk, [{ op: "lte", value: 1500 }]);
  });

  it('parses mentions "Name" without treating the name as exact or Attribute', () => {
    const c = parseTargetCriteria(
      'monster that mentions "Light and Darkness Ritual"',
    );
    assert.deepEqual(c.mentionsNames, ["Light and Darkness Ritual"]);
    assert.equal(c.exactNames, undefined);
    assert.equal(c.attributes, undefined);
    assert.ok(c.kinds?.includes("monster"));
  });

  it('parses non-Race "Archetype" monster as excludeRaces', () => {
    const c = parseTargetCriteria('non-Warrior "Vanquish Soul" monster');
    assert.deepEqual(c.archetypes, ["Vanquish Soul"]);
    assert.deepEqual(c.excludeRaces, ["Warrior"]);
    assert.equal(c.races, undefined);
    assert.ok(c.kinds?.includes("monster"));
  });
});

describe("searcher fixtures — parsePullClauses", () => {
  for (const fixture of SEARCHER_FIXTURES) {
    it(`parses ${fixture.name}`, () => {
      const clauses = parsePullClauses(fixture.desc);
      const matchable = clauses.filter(clauseIsMatchable);
      assert.ok(
        matchable.length >= fixture.expect.minClauses,
        `${fixture.name}: expected >= ${fixture.expect.minClauses} clauses, got ${matchable.length}: ${JSON.stringify(clauses)}`,
      );

      if (fixture.expect.locations) {
        const locs = new Set(matchable.flatMap((c) => c.locations));
        for (const loc of fixture.expect.locations) {
          assert.ok(locs.has(loc), `${fixture.name}: missing location ${loc}`);
        }
      }

      if (fixture.expect.actions) {
        const acts = new Set(matchable.map((c) => c.action));
        for (const a of fixture.expect.actions) {
          assert.ok(acts.has(a), `${fixture.name}: missing action ${a}`);
        }
      }

      const crit = fixture.expect.criteria;
      if (crit) {
        const joined = matchable.map((c) => c.criteria);
        if (crit.races) {
          assert.ok(
            joined.some((c) => crit.races!.every((r) => c.races?.includes(r))),
            `${fixture.name}: races`,
          );
        }
        if (crit.attributes) {
          assert.ok(
            joined.some((c) =>
              crit.attributes!.every((a) => c.attributes?.includes(a)),
            ),
            `${fixture.name}: attributes`,
          );
        }
        if (crit.archetypes) {
          assert.ok(
            joined.some((c) =>
              crit.archetypes!.every((a) => c.archetypes?.includes(a)),
            ),
            `${fixture.name}: archetypes`,
          );
        }
        if (crit.kindsIncludes) {
          assert.ok(
            joined.some((c) =>
              crit.kindsIncludes!.every((k) => c.kinds?.includes(k as never)),
            ),
            `${fixture.name}: kinds ${JSON.stringify(joined)}`,
          );
        }
        if (crit.levelLte !== undefined) {
          assert.ok(
            joined.some((c) =>
              c.levels?.some((l) => l.op === "lte" && l.value === crit.levelLte),
            ),
            `${fixture.name}: levelLte`,
          );
        }
        if (crit.levelEq !== undefined) {
          assert.ok(
            joined.some((c) =>
              c.levels?.some((l) => l.op === "eq" && l.value === crit.levelEq),
            ),
            `${fixture.name}: levelEq`,
          );
        }
        if (crit.atkLte !== undefined) {
          assert.ok(
            joined.some((c) =>
              c.atk?.some((l) => l.op === "lte" && l.value === crit.atkLte),
            ),
            `${fixture.name}: atkLte`,
          );
        }
        if (crit.excludeNames) {
          assert.ok(
            joined.some((c) =>
              crit.excludeNames!.every((n) => c.excludeNames?.includes(n)),
            ),
            `${fixture.name}: excludeNames`,
          );
        }
        if (crit.excludeRaces) {
          assert.ok(
            joined.some((c) =>
              crit.excludeRaces!.every((r) => c.excludeRaces?.includes(r)),
            ),
            `${fixture.name}: excludeRaces`,
          );
          assert.ok(
            !joined.some((c) =>
              crit.excludeRaces!.some((r) => c.races?.includes(r)),
            ),
            `${fixture.name}: excludeRaces must not also appear as required races`,
          );
        }
        if (crit.mentionsNames) {
          assert.ok(
            joined.some((c) =>
              crit.mentionsNames!.every((n) => c.mentionsNames?.includes(n)),
            ),
            `${fixture.name}: mentionsNames`,
          );
          assert.ok(
            !joined.some((c) =>
              crit.mentionsNames!.some((n) => c.exactNames?.includes(n)),
            ),
            `${fixture.name}: mentionsNames must not be exactNames`,
          );
        }
      }

      // Hand-only send costs must not become pull clauses (One for One / Scorpio)
      if (fixture.name === "One for One" || fixture.name === "Predaplant Ophrys Scorpio") {
        assert.ok(
          !matchable.some(
            (c) =>
              c.action === "send_to_gy" &&
              c.locations.length === 1 &&
              c.locations[0] === "hand",
          ),
          `${fixture.name}: should ignore send-from-hand cost`,
        );
      }

      // Mill top N cards must not become a pull (Charge)
      if (fixture.name === "Charge of the Light Brigade") {
        assert.equal(matchable.length, 1);
        assert.ok(matchable[0]!.criteria.archetypes?.includes("Lightsworn"));
      }
    });
  }
});

describe("cardMatchesCriteria + findPullMatches (mini pool)", () => {
  const pool = MINI_POOL as unknown as Card[];

  it("ROTA pulls Level 4 Warriors only", () => {
    const rota = {
      id: 32807846,
      name: "Reinforcement of the Army",
      desc: SEARCHER_FIXTURES[0]!.desc,
      type: "Spell Card",
      images: [],
    } satisfies Card;
    const result = findPullMatches(rota, pool);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(names.includes("Test Warrior Four"));
    assert.ok(!names.includes("Test Warrior Five"));
    assert.ok(!names.includes("Test Dragon"));
  });

  it("Terraforming pulls Field Spells", () => {
    const card = {
      id: 73628505,
      name: "Terraforming",
      desc: "Add 1 Field Spell from your Deck to your hand.",
      type: "Spell Card",
      images: [],
    } satisfies Card;
    const result = findPullMatches(card, pool);
    assert.deepEqual(
      result.matches.map((m) => m.card.name),
      ["Test Field"],
    );
  });

  it("Scorpio excludes itself and matches Predaplant", () => {
    const card = {
      id: 35272499,
      name: "Predaplant Ophrys Scorpio",
      desc: SEARCHER_FIXTURES.find((f) => f.name === "Predaplant Ophrys Scorpio")!
        .desc,
      type: "Effect Monster",
      images: [],
    } satisfies Card;
    const result = findPullMatches(card, pool);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(names.includes("Predaplant Test Seed"));
    assert.ok(!names.includes("Predaplant Ophrys Scorpio"));
  });

  it("Preparation of Rites matches Ritual Effect Monster by level", () => {
    const card = {
      id: 96729612,
      name: "Preparation of Rites",
      desc: SEARCHER_FIXTURES.find((f) => f.name === "Preparation of Rites")!.desc,
      type: "Spell Card",
      images: [],
    } satisfies Card;
    const result = findPullMatches(card, pool);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(names.includes("Relinquished"));
    assert.ok(!names.includes("Blue-Eyes Chaos MAX Dragon"));
  });

  it("name search ranks exact / prefix / contains", () => {
    const hits = searchCardsByName(pool, "predaplant");
    assert.ok(hits.length >= 2);
    assert.equal(hits[0]!.rank <= hits[1]!.rank, true);
  });

  it("banlist is irrelevant to criteria matching", () => {
    const banned = {
      ...pool[0]!,
      banlist: { ban_tcg: "Forbidden" },
    };
    assert.equal(
      cardMatchesCriteria(banned, {
        kinds: ["monster"],
        races: ["Warrior"],
        levels: [{ op: "lte", value: 4 }],
      }),
      true,
    );
  });

  it("Mind Shuffle matches monsters that mention the Ritual", () => {
    const card = {
      id: 24749710,
      name: "Mind Shuffle",
      desc: SEARCHER_FIXTURES.find((f) => f.name === "Mind Shuffle")!.desc,
      type: "Trap Card",
      images: [],
    } satisfies Card;
    const result = findPullMatches(card, pool);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(names.includes("Test Mentions Ritual"));
    assert.ok(!names.includes("Test No Mention Monster"));
    assert.ok(!names.includes("Light and Darkness Ritual"));
  });

  it("Vanquish Soul Razen excludes Warriors of the archetype", () => {
    const card = {
      id: 29302858,
      name: "Vanquish Soul Razen",
      desc: SEARCHER_FIXTURES.find((f) => f.name === "Vanquish Soul Razen")!
        .desc,
      type: "Effect Monster",
      images: [],
    } satisfies Card;
    const result = findPullMatches(card, pool);
    const names = result.matches.map((m) => m.card.name);
    assert.ok(names.includes("Vanquish Soul Test Dragon"));
    assert.ok(!names.includes("Vanquish Soul Test Warrior"));
  });
});

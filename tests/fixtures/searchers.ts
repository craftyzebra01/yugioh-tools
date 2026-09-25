/**
 * Representative effect-text fixtures for headless matcher tests.
 * Criteria expected values are hand-checked against PSCT intent.
 */

export interface SearcherFixture {
  id: number;
  name: string;
  desc: string;
  type: string;
  race?: string;
  /** Expectations on parsed clauses */
  expect: {
    /** Minimum number of matchable pull clauses */
    minClauses: number;
    /** At least one clause should include these locations */
    locations?: Array<"deck" | "gy" | "banished" | "hand" | "extra_deck">;
    actions?: Array<
      | "add_to_hand"
      | "special_summon"
      | "send_to_gy"
      | "banish"
      | "return_to_hand"
    >;
    /** Soft checks on first matchable clause criteria */
    criteria?: {
      races?: string[];
      attributes?: string[];
      archetypes?: string[];
      kindsIncludes?: string[];
      levelLte?: number;
      levelEq?: number;
      atkLte?: number;
      excludeNames?: string[];
    };
  };
}

export const SEARCHER_FIXTURES: SearcherFixture[] = [
  {
    id: 32807846,
    name: "Reinforcement of the Army",
    type: "Spell Card",
    race: "Normal",
    desc: "Add 1 Level 4 or lower Warrior monster from your Deck to your hand.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["add_to_hand"],
      criteria: { races: ["Warrior"], kindsIncludes: ["monster"], levelLte: 4 },
    },
  },
  {
    id: 26202165,
    name: "Sangan",
    type: "Effect Monster",
    race: "Fiend",
    desc: 'If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand, but you cannot activate cards, or the effects of cards, with that name for the rest of this turn. You can only use this effect of "Sangan" once per turn.',
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["add_to_hand"],
      criteria: { kindsIncludes: ["monster"], atkLte: 1500 },
    },
  },
  {
    id: 81439173,
    name: "Foolish Burial",
    type: "Spell Card",
    race: "Normal",
    desc: "Send 1 monster from your Deck to the GY.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["send_to_gy"],
      criteria: { kindsIncludes: ["monster"] },
    },
  },
  {
    id: 83764719,
    name: "Monster Reborn",
    type: "Spell Card",
    race: "Normal",
    desc: "Target 1 monster in either GY; Special Summon it.",
    expect: {
      minClauses: 1,
      locations: ["gy"],
      actions: ["special_summon"],
      criteria: { kindsIncludes: ["monster"] },
    },
  },
  {
    id: 73628505,
    name: "Terraforming",
    type: "Spell Card",
    race: "Normal",
    desc: "Add 1 Field Spell from your Deck to your hand.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["add_to_hand"],
      criteria: { kindsIncludes: ["field_spell"] },
    },
  },
  {
    id: 28985331,
    name: "Armageddon Knight",
    type: "Effect Monster",
    race: "Warrior",
    desc: "When this card is Summoned: You can send 1 DARK monster from your Deck to the GY.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["send_to_gy"],
      criteria: { attributes: ["DARK"], kindsIncludes: ["monster"] },
    },
  },
  {
    id: 41386308,
    name: "Mathematician",
    type: "Effect Monster",
    race: "Spellcaster",
    desc: "When this card is Normal Summoned: You can send 1 Level 4 or lower monster from your Deck to the GY. When this card is destroyed by battle and sent to the GY: You can draw 1 card.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["send_to_gy"],
      criteria: { kindsIncludes: ["monster"], levelLte: 4 },
    },
  },
  {
    id: 48686504,
    name: "Lonefire Blossom",
    type: "Effect Monster",
    race: "Plant",
    desc: "Once per turn: You can Tribute 1 face-up Plant monster; Special Summon 1 Plant monster from your Deck.",
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["special_summon"],
      criteria: { races: ["Plant"], kindsIncludes: ["monster"] },
    },
  },
  {
    id: 35272499,
    name: "Predaplant Ophrys Scorpio",
    type: "Effect Monster",
    race: "Plant",
    desc: 'If this card is Normal or Special Summoned: You can send 1 monster from your hand to the GY; Special Summon 1 "Predaplant" monster from your Deck, except "Predaplant Ophrys Scorpio". You can only use this effect of "Predaplant Ophrys Scorpio" once per turn.',
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["special_summon"],
      criteria: {
        archetypes: ["Predaplant"],
        kindsIncludes: ["monster"],
        excludeNames: ["Predaplant Ophrys Scorpio"],
      },
    },
  },
  {
    id: 94886282,
    name: "Charge of the Light Brigade",
    type: "Spell Card",
    race: "Normal",
    desc: 'Send the top 3 cards of your Deck to the Graveyard; add 1 Level 4 or lower "Lightsworn" monster from your Deck to your hand.',
    expect: {
      minClauses: 1,
      locations: ["deck"],
      actions: ["add_to_hand"],
      criteria: {
        archetypes: ["Lightsworn"],
        kindsIncludes: ["monster"],
        levelLte: 4,
      },
    },
  },
  {
    id: 96729612,
    name: "Preparation of Rites",
    type: "Spell Card",
    race: "Normal",
    desc: "Add 1 Level 7 or lower Ritual Monster from your Deck to your hand, then you can add 1 Ritual Spell from your GY to your hand.",
    expect: {
      minClauses: 2,
      locations: ["deck", "gy"],
      actions: ["add_to_hand"],
      criteria: { kindsIncludes: ["ritual_monster"], levelLte: 7 },
    },
  },
  {
    id: 67723438,
    name: "Emergency Teleport",
    type: "Spell Card",
    race: "Quick-Play",
    desc: "Special Summon 1 Level 3 or lower Psychic-Type monster from your hand or Deck, but banish it during the End Phase of this turn.",
    expect: {
      minClauses: 1,
      locations: ["deck", "hand"],
      actions: ["special_summon"],
      criteria: { races: ["Psychic"], kindsIncludes: ["monster"], levelLte: 3 },
    },
  },
  {
    id: 2295440,
    name: "One for One",
    type: "Spell Card",
    race: "Normal",
    desc: "Send 1 monster from your hand to the GY; Special Summon 1 Level 1 monster from your hand or Deck.",
    expect: {
      minClauses: 1,
      locations: ["deck", "hand"],
      actions: ["special_summon"],
      criteria: { kindsIncludes: ["monster"], levelEq: 1 },
    },
  },
];

/** Tiny synthetic pool for criteria matching without the full cache. */
export const MINI_POOL = [
  {
    id: 1,
    name: "Test Warrior Four",
    desc: "",
    type: "Effect Monster",
    race: "Warrior",
    attribute: "EARTH",
    level: 4,
    atk: 1200,
    def: 1000,
    images: [],
  },
  {
    id: 2,
    name: "Test Warrior Five",
    desc: "",
    type: "Effect Monster",
    race: "Warrior",
    attribute: "EARTH",
    level: 5,
    atk: 1800,
    def: 1000,
    images: [],
  },
  {
    id: 3,
    name: "Test Dragon",
    desc: "",
    type: "Effect Monster",
    race: "Dragon",
    attribute: "DARK",
    level: 4,
    atk: 1400,
    def: 1000,
    images: [],
  },
  {
    id: 4,
    name: "Test Field",
    desc: "",
    type: "Spell Card",
    race: "Field",
    images: [],
  },
  {
    id: 5,
    name: "Predaplant Test Seed",
    desc: "",
    type: "Effect Monster",
    race: "Plant",
    attribute: "DARK",
    level: 3,
    archetype: "Predaplant",
    atk: 800,
    def: 800,
    images: [],
  },
  {
    id: 6,
    name: "Predaplant Ophrys Scorpio",
    desc: "",
    type: "Effect Monster",
    race: "Plant",
    attribute: "DARK",
    level: 3,
    archetype: "Predaplant",
    atk: 1200,
    def: 800,
    images: [],
  },
  {
    id: 7,
    name: "Relinquished",
    desc: "",
    type: "Ritual Effect Monster",
    race: "Spellcaster",
    attribute: "DARK",
    level: 1,
    atk: 0,
    def: 0,
    images: [],
  },
  {
    id: 8,
    name: "Blue-Eyes Chaos MAX Dragon",
    desc: "",
    type: "Ritual Effect Monster",
    race: "Dragon",
    attribute: "LIGHT",
    level: 8,
    atk: 4000,
    def: 0,
    images: [],
  },
] as const;

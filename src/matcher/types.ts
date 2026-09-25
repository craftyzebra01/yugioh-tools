/**
 * Pull-matching types. Matching is derived from effect text, not curated links.
 */

import type { Card } from "../cards/types.js";

/** Zone the selected card retrieves / moves a target from. */
export type PullLocation =
  | "deck"
  | "extra_deck"
  | "gy"
  | "banished"
  | "hand"
  | "field"
  | "unknown";

/** How the effect moves / retrieves the target. */
export type PullAction =
  | "add_to_hand"
  | "special_summon"
  | "send_to_gy"
  | "banish"
  | "return_to_hand"
  | "return_to_deck"
  | "set"
  | "equip"
  | "place"
  | "other";

export type StatOp = "eq" | "lte" | "gte" | "lt" | "gt";

export interface StatConstraint {
  op: StatOp;
  value: number;
}

/**
 * Structured criteria extracted from a pull clause's target phrase.
 * Cards in the TCG pool that satisfy all set fields are potential pulls.
 */
export interface PullCriteria {
  /** Exact English card names (from quoted names in PSCT). */
  exactNames?: string[];
  /** Archetype quoted names, e.g. Predaplant / Lightsworn. */
  archetypes?: string[];
  /** Monster types / Spell-Trap properties (YGOPRODeck `race`). */
  races?: string[];
  /** Attributes: DARK, LIGHT, … */
  attributes?: string[];
  levels?: StatConstraint[];
  atk?: StatConstraint[];
  def?: StatConstraint[];
  linkval?: StatConstraint[];
  scales?: StatConstraint[];
  /**
   * High-level kind filters derived from phrases like "monster", "Spell",
   * "Ritual Monster", "Field Spell", "Normal Monster", etc.
   */
  kinds?: PullKind[];
  /** Names that must not match (e.g. except "Predaplant Ophrys Scorpio"). */
  excludeNames?: string[];
  /** True when the clause is a pull but criteria could not be fully parsed. */
  uncertain?: boolean;
  /** Raw target phrase between count and "from …". */
  rawTargetText?: string;
}

export type PullKind =
  | "monster"
  | "spell"
  | "trap"
  | "normal_monster"
  | "effect_monster"
  | "fusion"
  | "synchro"
  | "xyz"
  | "link"
  | "pendulum"
  | "ritual_monster"
  | "ritual_spell"
  | "field_spell"
  | "equip_spell"
  | "continuous_spell"
  | "quick_play_spell"
  | "normal_spell"
  | "counter_trap"
  | "continuous_trap"
  | "normal_trap";

export interface PullClause {
  action: PullAction;
  locations: PullLocation[];
  criteria: PullCriteria;
  /** Snippet of `desc` that produced this clause. */
  sourceText: string;
}

export interface PullMatch {
  card: Card;
  /** Locations implied by matching clauses (deduped). */
  locations: PullLocation[];
  /** Actions implied by matching clauses (deduped). */
  actions: PullAction[];
  /** Source snippets from clauses that matched this card. */
  sources: string[];
}

export interface MatchResult {
  source: Card;
  clauses: PullClause[];
  /** Flat unique matches, alphabetical by name. Banlist not applied. */
  matches: PullMatch[];
  /** Clauses marked uncertain (incomplete criteria). */
  uncertainClauses: PullClause[];
}

export interface NameSearchHit {
  card: Card;
  /** 0 = exact (case-insensitive); lower is better. */
  rank: number;
}

/**
 * Evaluate whether a TCG card satisfies pull criteria.
 * Banlist is never consulted.
 */

import type { Card } from "../cards/types.js";
import type { PullCriteria, PullKind, StatConstraint } from "./types.js";

const MONSTER_TYPE_RE = /monster/i;
const SPELL_TYPE_RE = /spell/i;
const TRAP_TYPE_RE = /trap/i;

function satisfiesStat(value: number | undefined, constraints: StatConstraint[]): boolean {
  if (value === undefined || Number.isNaN(value)) return false;
  for (const c of constraints) {
    switch (c.op) {
      case "eq":
        if (value !== c.value) return false;
        break;
      case "lte":
        if (!(value <= c.value)) return false;
        break;
      case "gte":
        if (!(value >= c.value)) return false;
        break;
      case "lt":
        if (!(value < c.value)) return false;
        break;
      case "gt":
        if (!(value > c.value)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

function isMonster(card: Card): boolean {
  return MONSTER_TYPE_RE.test(card.type);
}

function isSpell(card: Card): boolean {
  return SPELL_TYPE_RE.test(card.type) && !MONSTER_TYPE_RE.test(card.type);
}

function isTrap(card: Card): boolean {
  return TRAP_TYPE_RE.test(card.type) && !MONSTER_TYPE_RE.test(card.type);
}

function hasKind(card: Card, kind: PullKind): boolean {
  const t = card.type;
  const race = card.race ?? "";
  switch (kind) {
    case "monster":
      return isMonster(card);
    case "spell":
      return isSpell(card);
    case "trap":
      return isTrap(card);
    case "normal_monster":
      return /normal monster/i.test(t);
    case "effect_monster":
      // Broad: Effect Monster frame, or Tuner/Gemini/etc. that are effect monsters
      return (
        /effect monster/i.test(t) ||
        /tuner monster/i.test(t) ||
        /gemini monster/i.test(t) ||
        /union monster/i.test(t) ||
        /spirit monster/i.test(t) ||
        /toon monster/i.test(t) ||
        /flip monster/i.test(t)
      );
    case "fusion":
      return /fusion/i.test(t);
    case "synchro":
      return /synchro/i.test(t);
    case "xyz":
      return /xyz/i.test(t);
    case "link":
      return /link/i.test(t);
    case "pendulum":
      return /pendulum/i.test(t) || card.scale !== undefined;
    case "ritual_monster":
      // "Ritual Effect Monster" / "Pendulum Effect Ritual Monster" — not always
      // the contiguous substring "Ritual Monster".
      return /ritual/i.test(t) && MONSTER_TYPE_RE.test(t);
    case "ritual_spell":
      return isSpell(card) && /^ritual$/i.test(race);
    case "field_spell":
      return isSpell(card) && /^field$/i.test(race);
    case "equip_spell":
      return isSpell(card) && /^equip$/i.test(race);
    case "continuous_spell":
      return isSpell(card) && /^continuous$/i.test(race);
    case "quick_play_spell":
      return isSpell(card) && /^quick-play$/i.test(race);
    case "normal_spell":
      return isSpell(card) && /^normal$/i.test(race);
    case "counter_trap":
      return isTrap(card) && /^counter$/i.test(race);
    case "continuous_trap":
      return isTrap(card) && /^continuous$/i.test(race);
    case "normal_trap":
      return isTrap(card) && /^normal$/i.test(race);
    default:
      return false;
  }
}

function archetypeMatches(card: Card, archetype: string): boolean {
  const a = archetype.trim().toLowerCase();
  if (!a) return false;
  if (card.archetype?.toLowerCase() === a) return true;
  // YGOPRODeck archetype tags are sometimes missing; name prefix / contains is a common fallback.
  const name = card.name.toLowerCase();
  if (name === a) return true;
  if (name.startsWith(`${a} `) || name.includes(` ${a} `) || name.endsWith(` ${a}`)) {
    return true;
  }
  // Hyphenated series often appear as "Blue-Eyes White Dragon"
  if (a.includes("-") && name.includes(a)) return true;
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `card`'s effect text mentions the named card (PSCT quotes).
 * OPT self-name quotes alone do not count when looking for a different name.
 */
function cardMentionsName(card: Card, name: string): boolean {
  const needle = name.trim();
  if (!needle) return false;
  const re = new RegExp(`["“”']${escapeRegExp(needle)}["“”']`, "i");
  return re.test(card.desc ?? "");
}

/**
 * Returns true if `card` satisfies every constraint present on `criteria`.
 * Uncertain empty criteria (no fields) match nothing — callers should not
 * expand uncertain clauses into the full pool.
 */
export function cardMatchesCriteria(card: Card, criteria: PullCriteria): boolean {
  if (criteria.excludeNames?.length) {
    const lower = card.name.toLowerCase();
    if (criteria.excludeNames.some((n) => n.toLowerCase() === lower)) {
      return false;
    }
  }

  if (criteria.excludeRaces?.length) {
    const race = (card.race ?? "").toLowerCase();
    if (criteria.excludeRaces.some((r) => race === r.toLowerCase())) {
      return false;
    }
  }

  if (criteria.exactNames?.length) {
    const lower = card.name.toLowerCase();
    if (!criteria.exactNames.some((n) => n.toLowerCase() === lower)) {
      return false;
    }
    // Exact name is sufficient when present (other fields still apply if set).
  }

  if (criteria.mentionsNames?.length) {
    // AND semantics across listed names (rare); each must appear quoted in desc.
    if (!criteria.mentionsNames.every((n) => cardMentionsName(card, n))) {
      return false;
    }
  }

  if (criteria.archetypes?.length) {
    if (!criteria.archetypes.some((a) => archetypeMatches(card, a))) {
      return false;
    }
  }

  if (criteria.races?.length) {
    const race = (card.race ?? "").toLowerCase();
    if (!criteria.races.some((r) => race === r.toLowerCase())) {
      return false;
    }
  }

  if (criteria.attributes?.length) {
    const attr = (card.attribute ?? "").toLowerCase();
    if (!criteria.attributes.some((a) => attr === a.toLowerCase())) {
      return false;
    }
  }

  if (criteria.kinds?.length) {
    // OR semantics: parser emits alternatives (e.g. Spell/Trap → spell|trap)
    // or a single specific kind (field_spell, ritual_monster, …).
    if (!criteria.kinds.some((k) => hasKind(card, k))) {
      return false;
    }
  }

  if (criteria.levels?.length) {
    // Links / non-leveled cards must not satisfy "Level N" constraints.
    if (card.linkval !== undefined && card.level === undefined) return false;
    if (/link monster/i.test(card.type) && (card.level === undefined || card.level === 0)) {
      return false;
    }
    if (!satisfiesStat(card.level, criteria.levels)) return false;
  }

  if (criteria.atk?.length) {
    if (!satisfiesStat(card.atk, criteria.atk)) return false;
  }

  if (criteria.def?.length) {
    if (!satisfiesStat(card.def, criteria.def)) return false;
  }

  if (criteria.linkval?.length) {
    if (!satisfiesStat(card.linkval, criteria.linkval)) return false;
  }

  if (criteria.scales?.length) {
    if (!satisfiesStat(card.scale, criteria.scales)) return false;
  }

  // If literally nothing was constrained (and not exact-name-only already handled),
  // treat as non-matching to avoid dumping the whole corpus on parse failure.
  const hasConstraint =
    (criteria.exactNames?.length ?? 0) > 0 ||
    (criteria.archetypes?.length ?? 0) > 0 ||
    (criteria.mentionsNames?.length ?? 0) > 0 ||
    (criteria.races?.length ?? 0) > 0 ||
    (criteria.attributes?.length ?? 0) > 0 ||
    (criteria.kinds?.length ?? 0) > 0 ||
    (criteria.levels?.length ?? 0) > 0 ||
    (criteria.atk?.length ?? 0) > 0 ||
    (criteria.def?.length ?? 0) > 0 ||
    (criteria.linkval?.length ?? 0) > 0 ||
    (criteria.scales?.length ?? 0) > 0;

  if (!hasConstraint) {
    return false;
  }

  return true;
}

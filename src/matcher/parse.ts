/**
 * Parse Yu-Gi-Oh! English effect text into pull clauses + structured criteria.
 *
 * v1 coverage targets common PSCT patterns (add / Special Summon / send / return
 * from Deck, GY, banished, hand). Relational / declare-any / material-list
 * effects are flagged uncertain — see docs/matching-coverage.md.
 */

import type {
  PullAction,
  PullClause,
  PullCriteria,
  PullKind,
  PullLocation,
  StatConstraint,
} from "./types.js";

const MONSTER_RACES = [
  "Creator God",
  "Divine-Beast",
  "Beast-Warrior",
  "Winged Beast",
  "Sea Serpent",
  "Illusion",
  "Cyberse",
  "Dinosaur",
  "Spellcaster",
  "Thunder",
  "Warrior",
  "Winged Beast",
  "Machine",
  "Dinosaur",
  "Zombie",
  "Wyrm",
  "Psychic",
  "Dragon",
  "Reptile",
  "Insect",
  "Plant",
  "Fairy",
  "Fiend",
  "Aqua",
  "Pyro",
  "Rock",
  "Fish",
  "Beast",
] as const;

// Longer names first for regex alternation
const RACE_ALT = [...MONSTER_RACES].sort((a, b) => b.length - a.length).join("|");

const ATTRIBUTES = ["DARK", "LIGHT", "EARTH", "WATER", "FIRE", "WIND", "DIVINE"] as const;
const ATTR_ALT = ATTRIBUTES.join("|");

const LOCATION_PATTERNS: Array<{ re: RegExp; loc: PullLocation }> = [
  { re: /\bextra\s+deck\b/i, loc: "extra_deck" },
  { re: /\bmain\s+deck\b/i, loc: "deck" },
  { re: /\bdeck\b/i, loc: "deck" },
  { re: /\b(?:gy|graveyard)\b/i, loc: "gy" },
  { re: /\bbanished\b/i, loc: "banished" },
  { re: /\bhand\b/i, loc: "hand" },
  { re: /\bfield\b/i, loc: "field" },
];

/**
 * Detect pull verb + optional destination; used to classify action.
 * Order matters — more specific phrases first.
 */
const ACTION_PATTERNS: Array<{ re: RegExp; action: PullAction }> = [
  { re: /\badd\b/i, action: "add_to_hand" },
  { re: /\bspecial\s+summon\b/i, action: "special_summon" },
  { re: /\bsend\b/i, action: "send_to_gy" },
  { re: /\bbanish\b/i, action: "banish" },
  { re: /\breturn\b/i, action: "return_to_hand" },
  { re: /\bset\b/i, action: "set" },
  { re: /\bequip\b/i, action: "equip" },
  { re: /\bplace\b/i, action: "place" },
];

/** Verbs that indicate moving/retrieving another card (broad "pull"). */
const PULL_VERB_RE =
  /\b(?:add|special\s+summon|send|return|set|equip|place|banish|take)\b/i;

/**
 * Core clause finder:
 *   VERB … N/TARGET … from … LOCATION
 * Destination ("to your hand") is optional and ignored for location labeling.
 *
 * Target text must not cross sentence/clause punctuation — otherwise a mill
 * cost + later add clause can glue into one false match (e.g. Charge of the
 * Light Brigade).
 */
const CLAUSE_RE = new RegExp(
  String.raw`\b((?:add|special\s+summon|send|return|set|equip|place|banish|take)` +
    String.raw`(?:\s+(?:up\s+to|them|it|that(?:\s+card)?|those(?:\s+cards?)?))?)` +
    String.raw`\s+` +
    String.raw`(?:(?:up\s+to|a\s+different)\s+)?` +
    String.raw`(?:(\d+|one|two|three|four|five|a|an)\s+)?` +
    String.raw`((?:(?!\bfrom\b)[^.;:])+?)` +
    String.raw`\s+from\s+` +
    String.raw`((?:(?:your|their|either(?:\s+player'?s?)?|an?\s+opponent'?s?|both\s+players'?|the)\s+)?)` +
    String.raw`([^.:;]*?)` +
    String.raw`(?=(?:[.;:]|\s*,\s*except\b|\s+to\s+your\s+hand|\s+to\s+the\s+(?:gy|graveyard)|$))`,
  "gi",
);

/** Trailing exclusion after a pull clause: `, except "Name"`. */
const EXCEPT_AFTER_RE = /^\s*,\s*except\s+["“”']([^"“”']+)["“”']/i;

/** "Target 1 monster in either GY; Special Summon it." style */
const TARGET_THEN_ACT_RE =
  /\btarget\s+(\d+|one|a|an)\s+((?:(?!\bin\b)[^.;])+?)\s+in\s+((?:your|their|either(?:\s+player'?s?)?|an?\s+opponent'?s?|the)\s+)?([^.;]+?)(?:[.;]|$)/gi;

const QUOTED_NAME_RE = /["“”']([^"“”']+)["“”']/g;

function parseLocations(text: string): PullLocation[] {
  const found: PullLocation[] = [];
  for (const { re, loc } of LOCATION_PATTERNS) {
    if (re.test(text) && !found.includes(loc)) found.push(loc);
  }
  return found.length > 0 ? found : ["unknown"];
}

function detectAction(verbSpan: string, full: string): PullAction {
  for (const { re, action } of ACTION_PATTERNS) {
    if (re.test(verbSpan)) {
      if (action === "return_to_hand" && /\bdeck\b/i.test(full) && /\breturn\b/i.test(verbSpan)) {
        if (/\b(?:to\s+(?:the\s+)?(?:top|bottom)\s+of\s+(?:your\s+)?deck|to\s+(?:your\s+)?deck)\b/i.test(full)) {
          return "return_to_deck";
        }
      }
      if (action === "send_to_gy" && /\bbanish\b/i.test(verbSpan)) return "banish";
      return action;
    }
  }
  return "other";
}

function parseStatPhrase(text: string, label: RegExp): StatConstraint[] {
  const out: StatConstraint[] = [];
  // Level/Rank 4 or lower / or less / or below
  const orLower = new RegExp(
    String.raw`(?:level|rank)\s+(\d+)\s+or\s+(?:lower|less|below)`,
    "i",
  );
  const orHigher = new RegExp(
    String.raw`(?:level|rank)\s+(\d+)\s+or\s+(?:higher|more|above)`,
    "i",
  );
  const exact = new RegExp(String.raw`(?:level|rank)\s+(\d+)(?!\s+or\s+)`, "i");

  if (label.source.includes("level") || label.source.includes("rank")) {
    let m = orLower.exec(text);
    if (m) out.push({ op: "lte", value: Number(m[1]) });
    m = orHigher.exec(text);
    if (m) out.push({ op: "gte", value: Number(m[1]) });
    if (out.length === 0) {
      m = exact.exec(text);
      if (m) out.push({ op: "eq", value: Number(m[1]) });
    }
  }
  return out;
}

function parseAtkDef(text: string): { atk?: StatConstraint[]; def?: StatConstraint[] } {
  const result: { atk?: StatConstraint[]; def?: StatConstraint[] } = {};
  const patterns: Array<{
    re: RegExp;
    key: "atk" | "def";
  }> = [
    {
      re: /\b(?:with\s+)?(\d+)\s+or\s+(?:less|lower|below)\s+ATK\b/i,
      key: "atk",
    },
    {
      re: /\b(?:with\s+)?(\d+)\s+or\s+(?:more|higher|above)\s+ATK\b/i,
      key: "atk",
    },
    {
      re: /\b(?:with\s+)?(\d+)\s+ATK\b/i,
      key: "atk",
    },
    {
      re: /\b(?:with\s+)?(\d+)\s+or\s+(?:less|lower|below)\s+DEF\b/i,
      key: "def",
    },
    {
      re: /\b(?:with\s+)?(\d+)\s+or\s+(?:more|higher|above)\s+DEF\b/i,
      key: "def",
    },
    {
      re: /\b(?:with\s+)?(\d+)\s+DEF\b/i,
      key: "def",
    },
  ];

  for (const { re, key } of patterns) {
    const m = re.exec(text);
    if (!m) continue;
    const value = Number(m[1]);
    let op: StatConstraint["op"] = "eq";
    if (/or\s+(?:less|lower|below)/i.test(m[0])) op = "lte";
    else if (/or\s+(?:more|higher|above)/i.test(m[0])) op = "gte";
    const list = result[key] ?? [];
    list.push({ op, value });
    result[key] = list;
    break; // first ATK / first DEF hit is enough for v1
  }
  return result;
}

function extractQuoted(text: string): string[] {
  const names: string[] = [];
  QUOTED_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTED_NAME_RE.exec(text)) !== null) {
    const n = m[1]!.trim();
    if (n && !names.includes(n)) names.push(n);
  }
  return names;
}

/** Strip quoted card/archetype names so attribute/race scanners ignore them. */
function stripQuotedSpans(text: string): string {
  return text.replace(/["“”'][^"“”']+["“”']/g, " ");
}

/**
 * PSCT: `monster that mentions "X"` / `Spell/Trap that mentions "X"`.
 * The quoted name is a reference target, not an exact-name pull.
 */
function extractMentionsNames(text: string): string[] {
  const out: string[] = [];
  const re = /\bmentions?\s+["“”']([^"“”']+)["“”']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = m[1]!.trim();
    if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

function parseExcludeRaces(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(String.raw`\bnon-(${RACE_ALT})\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const found = MONSTER_RACES.find((r) => r.toLowerCase() === m![1]!.toLowerCase());
    const race = found ?? m[1]!;
    if (!out.some((x) => x.toLowerCase() === race.toLowerCase())) out.push(race);
  }
  return out;
}

function parseKindsAndRace(text: string): {
  kinds: PullKind[];
  races: string[];
} {
  const kinds: PullKind[] = [];
  const races: string[] = [];
  // Ignore attribute/race tokens that only appear inside quotes (e.g. "Light and Darkness Ritual").
  const t = stripQuotedSpans(text);

  const kindRules: Array<{ re: RegExp; kind: PullKind }> = [
    { re: /\britual\s+monster\b/i, kind: "ritual_monster" },
    { re: /\britual\s+spell\b/i, kind: "ritual_spell" },
    { re: /\bfield\s+spell\b/i, kind: "field_spell" },
    { re: /\bequip\s+spell\b/i, kind: "equip_spell" },
    { re: /\bcontinuous\s+spell\b/i, kind: "continuous_spell" },
    { re: /\bquick-?play\s+spell\b/i, kind: "quick_play_spell" },
    { re: /\bnormal\s+spell\b/i, kind: "normal_spell" },
    { re: /\bcounter\s+trap\b/i, kind: "counter_trap" },
    { re: /\bcontinuous\s+trap\b/i, kind: "continuous_trap" },
    { re: /\bnormal\s+trap\b/i, kind: "normal_trap" },
    { re: /\bnormal\s+monster\b/i, kind: "normal_monster" },
    { re: /\beffect\s+monster\b/i, kind: "effect_monster" },
    { re: /\bfusion\s+monster\b/i, kind: "fusion" },
    { re: /\bsynchro\s+monster\b/i, kind: "synchro" },
    { re: /\bxyz\s+monster\b/i, kind: "xyz" },
    { re: /\blink\s+monster\b/i, kind: "link" },
    { re: /\bpendulum\s+monster\b/i, kind: "pendulum" },
    { re: /\bspell\/trap(?:\s+card)?s?\b/i, kind: "spell" }, // also add trap below
    { re: /\bspell(?:\s+card)?s?\b/i, kind: "spell" },
    { re: /\btrap(?:\s+card)?s?\b/i, kind: "trap" },
    { re: /\bmonsters?\b/i, kind: "monster" },
  ];

  // spell/trap special-case: add both
  if (/\bspell\/trap(?:\s+card)?s?\b/i.test(t)) {
    kinds.push("spell", "trap");
  } else {
    for (const { re, kind } of kindRules) {
      if (re.test(t) && !kinds.includes(kind)) {
        // Skip bare spell/trap/monster if a more specific kind already matched
        if (
          (kind === "spell" || kind === "trap" || kind === "monster") &&
          kinds.some((k) => k.includes("spell") || k.includes("trap") || k.includes("monster") || k === "fusion" || k === "synchro" || k === "xyz" || k === "link" || k === "pendulum")
        ) {
          // still allow monster alongside ritual_monster etc. — ritual_monster already implies monster
          if (kind === "monster" && kinds.some((k) => k.endsWith("monster") || k === "fusion" || k === "synchro" || k === "xyz" || k === "link" || k === "pendulum")) {
            continue;
          }
          if ((kind === "spell" || kind === "trap") && kinds.some((k) => k.includes(kind))) {
            continue;
          }
        }
        kinds.push(kind);
        // Only take the most specific first pass — break after first specific non-generic?
        if (kind !== "monster" && kind !== "spell" && kind !== "trap") break;
      }
    }
  }

  // `non-Warrior` is an exclusion — do not treat Warrior as a required race.
  const raceRe = new RegExp(
    String.raw`(?<!non-)\b(${RACE_ALT})(?:-Type)?\b`,
    "i",
  );
  const rm = raceRe.exec(t);
  if (rm) {
    // Normalize to canonical casing from our list
    const found = MONSTER_RACES.find((r) => r.toLowerCase() === rm[1]!.toLowerCase());
    races.push(found ?? rm[1]!);
  }

  return { kinds, races };
}

function parseAttributes(text: string): string[] {
  const attrs: string[] = [];
  // Strip quotes so "Light and Darkness Ritual" does not imply LIGHT Attribute.
  const scanned = stripQuotedSpans(text);
  const re = new RegExp(String.raw`\b(${ATTR_ALT})\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(scanned)) !== null) {
    const a = m[1]!.toUpperCase();
    if (!attrs.includes(a)) attrs.push(a);
  }
  return attrs;
}

function parseExcept(text: string): string[] {
  const out: string[] = [];
  const re = /\bexcept\s+["“”']([^"“”']+)["“”']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

/**
 * True when the target phrase looks relational / declare-any / unresolved.
 */
function looksUncertain(target: string): boolean {
  const t = target.toLowerCase();
  if (/\b(?:that|those|it|them|the\s+same|declared|mentioned|chosen|revealed)\b/.test(t) && extractQuoted(target).length === 0) {
    // "that monster" without further criteria — often needs prior context
    if (!/\b(?:level|rank|atk|def|monster|spell|trap)\b/i.test(target) && extractQuoted(target).length === 0) {
      return true;
    }
  }
  if (/\bspecifically\s+listed\b/i.test(t)) return true;
  if (/\bexactly\s+1\s+of\s+the\s+same\b/i.test(t)) return true;
  if (/\bdeclare\b/i.test(t)) return true;
  if (/\bwith\s+the\s+same\s+(?:type|attribute|level|name|original\s+type)\b/i.test(t)) return true;
  if (/\banother\s+card\s+with\s+the\s+same\b/i.test(t)) return true;
  return false;
}

/**
 * Classify quoted strings: mentions-reference vs archetype vs exact card name.
 * Heuristic: if followed by monster/card/spell/trap → archetype; else exact name.
 * Quotes that are the object of `mentions` are not exact-name pulls.
 */
function classifyQuotes(
  target: string,
  quoted: string[],
  mentionsNames: string[],
): { exactNames: string[]; archetypes: string[] } {
  const exactNames: string[] = [];
  const archetypes: string[] = [];
  const mentionSet = new Set(mentionsNames.map((n) => n.toLowerCase()));

  for (const q of quoted) {
    if (mentionSet.has(q.toLowerCase())) {
      continue;
    }
    // Pattern: "Name" monster/card/Spell/Trap
    const archetypeFollow = new RegExp(
      String.raw`["“”']${escapeRegExp(q)}["“”']\s+(?:monster|card|spell|trap|xyz|synchro|fusion|link|pendulum)`,
      "i",
    );
    if (archetypeFollow.test(target)) {
      archetypes.push(q);
      continue;
    }
    // "except Name" handled separately
    if (new RegExp(String.raw`except\s+["“”']${escapeRegExp(q)}["“”']`, "i").test(target)) {
      continue;
    }
    // OPT self-reference often appears outside the target span; if quote is alone as target
    exactNames.push(q);
  }
  return { exactNames, archetypes };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqNames(names: string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    if (!out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

export function parseTargetCriteria(targetText: string): PullCriteria {
  const raw = targetText.replace(/\s+/g, " ").trim();
  const criteria: PullCriteria = { rawTargetText: raw };

  const except = parseExcept(raw);
  if (except.length) criteria.excludeNames = except;

  const mentionsNames = extractMentionsNames(raw);
  if (mentionsNames.length) criteria.mentionsNames = mentionsNames;

  const excludeRaces = parseExcludeRaces(raw);
  if (excludeRaces.length) criteria.excludeRaces = excludeRaces;

  const quoted = extractQuoted(raw);
  const { exactNames, archetypes } = classifyQuotes(raw, quoted, mentionsNames);
  if (exactNames.length) criteria.exactNames = exactNames;
  if (archetypes.length) criteria.archetypes = archetypes;

  const { kinds, races } = parseKindsAndRace(raw);
  if (kinds.length) criteria.kinds = kinds;
  if (races.length) criteria.races = races;

  const attrs = parseAttributes(raw);
  if (attrs.length) criteria.attributes = attrs;

  const levels = parseStatPhrase(raw, /level|rank/i);
  if (levels.length) criteria.levels = levels;

  const { atk, def } = parseAtkDef(raw);
  if (atk?.length) criteria.atk = atk;
  if (def?.length) criteria.def = def;

  // Link rating
  const link = /\blink\s+(\d+)\b/i.exec(raw);
  if (link) criteria.linkval = [{ op: "eq", value: Number(link[1]) }];

  if (looksUncertain(raw)) {
    criteria.uncertain = true;
  }

  // If we have no usable constraints, mark uncertain
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
    (criteria.linkval?.length ?? 0) > 0;

  if (!hasConstraint) {
    criteria.uncertain = true;
  }

  return criteria;
}

function normalizeDesc(desc: string): string {
  return desc.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

/**
 * Extract pull clauses from a card's English `desc`.
 */
export function parsePullClauses(desc: string): PullClause[] {
  const text = normalizeDesc(desc);
  if (!text) return [];

  const clauses: PullClause[] = [];
  const seen = new Set<string>();

  const push = (clause: PullClause) => {
    const key = `${clause.action}|${clause.locations.join(",")}|${clause.criteria.rawTargetText}|${clause.sourceText}`;
    if (seen.has(key)) return;
    seen.add(key);
    clauses.push(clause);
  };

  CLAUSE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLAUSE_RE.exec(text)) !== null) {
    const verb = m[1]!;
    const target = (m[3] ?? "").trim();
    const locSpan = `${m[4] ?? ""}${m[5] ?? ""}`.trim();
    let sourceText = m[0]!.trim();

    // Skip milling top/bottom of deck without card criteria
    if (/^the\s+top\b/i.test(target) || /^the\s+bottom\b/i.test(target)) {
      continue;
    }
    // Skip unspecific "N cards" excavate/mill without a card type
    if (/^\d+\s+cards?\b/i.test(target) && !/\b(?:monster|spell|trap)\b/i.test(target)) {
      continue;
    }

    const locations = parseLocations(locSpan);
    const relevant = locations.filter(
      (l) =>
        l === "deck" ||
        l === "extra_deck" ||
        l === "gy" ||
        l === "banished" ||
        l === "hand",
    );
    if (relevant.length === 0) continue;

    const action = detectAction(verb, sourceText);

    // Discard/cost: "send … from your hand" alone is not a pull (e.g. One for One cost).
    // Keep hand when paired with Deck/GY/banished ("from your hand or Deck").
    if (
      action === "send_to_gy" &&
      relevant.length === 1 &&
      relevant[0] === "hand"
    ) {
      continue;
    }

    const criteria = parseTargetCriteria(target);

    // Attach trailing `, except "Name"` if present after the matched span
    const after = text.slice(CLAUSE_RE.lastIndex);
    const exceptM = EXCEPT_AFTER_RE.exec(after);
    if (exceptM) {
      const ex = exceptM[1]!.trim();
      criteria.excludeNames = uniqNames([...(criteria.excludeNames ?? []), ex]);
      sourceText = `${sourceText}${exceptM[0]}`.trim();
    }

    push({
      action,
      locations: relevant,
      criteria,
      sourceText,
    });
  }

  // Target-in-GY then act patterns
  TARGET_THEN_ACT_RE.lastIndex = 0;
  while ((m = TARGET_THEN_ACT_RE.exec(text)) !== null) {
    const target = (m[2] ?? "").trim();
    const locSpan = `${m[3] ?? ""}${m[4] ?? ""}`.trim();
    const locations = parseLocations(locSpan).filter((l) =>
      l === "gy" || l === "banished" || l === "deck" || l === "extra_deck" || l === "hand"
    );
    if (locations.length === 0) continue;

    // Look ahead for the action after the semicolon
    const afterIdx = (m.index ?? 0) + m[0]!.length;
    const after = text.slice(afterIdx, afterIdx + 120);
    let action: PullAction = "other";
    if (PULL_VERB_RE.test(after) || /\bspecial\s+summon\b/i.test(after) || /\badd\b/i.test(after)) {
      action = detectAction(after, after);
    } else if (/\bspecial\s+summon\b/i.test(text.slice(Math.max(0, (m.index ?? 0) - 40), afterIdx + 80))) {
      action = "special_summon";
    }

    // Monster Reborn: "Target 1 monster in either GY; Special Summon it."
    const window = text.slice(m.index ?? 0, (m.index ?? 0) + m[0]!.length + 80);
    if (/\bspecial\s+summon\b/i.test(window)) action = "special_summon";
    else if (/\badd\b/i.test(window)) action = "add_to_hand";
    else if (/\breturn\b/i.test(window)) action = "return_to_hand";
    else if (/\bbanish\b/i.test(window) && !/\bspecial\s+summon\b/i.test(window)) {
      // Called by the Grave: target then banish — moves a card; include as banish pull
      action = "banish";
    }

    const criteria = parseTargetCriteria(target);
    push({
      action,
      locations,
      criteria,
      sourceText: window.trim(),
    });
  }

  return clauses;
}

/**
 * Name search + pull matching against the local TCG card cache.
 * No live API calls; banlist is ignored.
 */

import type { Card } from "../cards/types.js";
import { cardMatchesCriteria } from "./criteria.js";
import { parsePullClauses } from "./parse.js";
import type {
  MatchResult,
  NameSearchHit,
  PullAction,
  PullClause,
  PullLocation,
  PullMatch,
} from "./types.js";

export function searchCardsByName(
  cards: readonly Card[],
  query: string,
  limit = 25,
): NameSearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: NameSearchHit[] = [];
  for (const card of cards) {
    const name = card.name.toLowerCase();
    if (name === q) {
      hits.push({ card, rank: 0 });
    } else if (name.startsWith(q)) {
      hits.push({ card, rank: 1 });
    } else if (name.includes(q)) {
      hits.push({ card, rank: 2 });
    }
  }

  hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.card.name.localeCompare(b.card.name);
  });
  return hits.slice(0, limit);
}

function uniq<T>(items: T[]): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Whether a clause should expand into the match list.
 * Uncertain clauses with no usable criteria are skipped (documented gaps)
 * rather than dumping the entire corpus or silently inventing links.
 */
export function clauseIsMatchable(clause: PullClause): boolean {
  if (clause.criteria.uncertain) {
    // Still matchable if we extracted concrete filters despite uncertainty flag
    // (e.g. relational hint + level). Require at least one hard filter.
  }
  const c = clause.criteria;
  return (
    (c.exactNames?.length ?? 0) > 0 ||
    (c.archetypes?.length ?? 0) > 0 ||
    (c.mentionsNames?.length ?? 0) > 0 ||
    (c.races?.length ?? 0) > 0 ||
    (c.attributes?.length ?? 0) > 0 ||
    (c.kinds?.length ?? 0) > 0 ||
    (c.levels?.length ?? 0) > 0 ||
    (c.atk?.length ?? 0) > 0 ||
    (c.def?.length ?? 0) > 0 ||
    (c.linkval?.length ?? 0) > 0 ||
    (c.scales?.length ?? 0) > 0
  );
}

/**
 * Compute the flat list of cards `source` can potentially pull from `pool`.
 * Dedupes by card id; sorts alphabetically by English name.
 */
export function findPullMatches(source: Card, pool: readonly Card[]): MatchResult {
  const clauses = parsePullClauses(source.desc);
  const uncertainClauses = clauses.filter((c) => c.criteria.uncertain);
  const matchable = clauses.filter(clauseIsMatchable);

  const byId = new Map<
    number,
    {
      card: Card;
      locations: PullLocation[];
      actions: PullAction[];
      sources: string[];
    }
  >();

  for (const clause of matchable) {
    for (const card of pool) {
      if (card.id === source.id) continue;
      if (!cardMatchesCriteria(card, clause.criteria)) continue;

      const existing = byId.get(card.id);
      if (existing) {
        for (const loc of clause.locations) {
          if (!existing.locations.includes(loc)) existing.locations.push(loc);
        }
        if (!existing.actions.includes(clause.action)) {
          existing.actions.push(clause.action);
        }
        if (!existing.sources.includes(clause.sourceText)) {
          existing.sources.push(clause.sourceText);
        }
      } else {
        byId.set(card.id, {
          card,
          locations: [...clause.locations],
          actions: [clause.action],
          sources: [clause.sourceText],
        });
      }
    }
  }

  const matches: PullMatch[] = [...byId.values()]
    .map((m) => ({
      card: m.card,
      locations: uniq(m.locations),
      actions: uniq(m.actions),
      sources: m.sources,
    }))
    .sort((a, b) => a.card.name.localeCompare(b.card.name));

  return {
    source,
    clauses,
    matches,
    uncertainClauses,
  };
}

/** Convenience: find by id then match. */
export function findPullMatchesById(
  sourceId: number,
  pool: readonly Card[],
): MatchResult | null {
  const source = pool.find((c) => c.id === sourceId);
  if (!source) return null;
  return findPullMatches(source, pool);
}

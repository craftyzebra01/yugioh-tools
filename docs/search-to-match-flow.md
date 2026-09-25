# Search → pull-match call flow

How a card name typed in the UI becomes a flat list of pull matches. This describes the **current** implementation (as of Card Pull Matcher v1), not a future design.

Related: [`matching-coverage.md`](./matching-coverage.md) (what the parser covers), [`card-data.md`](./card-data.md) (ingest/cache).

---

## Big picture

```
Browser (app.js)
  │  GET /api/search?q=…
  │  GET /api/cards/:id/pulls
  ▼
scripts/serve.ts → createMatcherApp()          src/web/server.ts
  │  loads cache once at startup
  ▼
loadCardsForMatching()                         src/cards/cache.ts
  │  reads data/cache/cards.json
  ▼
searchCardsByName()  /  findPullMatchesById()  src/matcher/match.ts
  │                         │
  │                         ├─ parsePullClauses()     src/matcher/parse.ts
  │                         ├─ clauseIsMatchable()
  │                         └─ cardMatchesCriteria()  src/matcher/criteria.ts
  ▼
JSON response → app.js renders flat <ol>
```

Runtime matching **never** calls YGOPRODeck. The pool is the local TCG cache loaded at process start.

---

## 0. Boot: cache load (once per process)

| Step | File | Function |
| --- | --- | --- |
| 1 | [`scripts/serve.ts`](../scripts/serve.ts) | `main()` — checks `data/cache/cards.json` exists, else exits |
| 2 | [`src/web/server.ts`](../src/web/server.ts) | `createMatcherApp()` |
| 3 | [`src/cards/cache.ts`](../src/cards/cache.ts) | `loadCardsForMatching(cacheDir)` → `readCardCache()` → `Card[]` |
| 4 | same | `readCacheMeta(cacheDir)` for health/meta |
| 5 | [`src/web/server.ts`](../src/web/server.ts) | builds `byId: Map<id, Card>` and starts `node:http` server |

Default cache dir: `DEFAULT_CACHE_DIR` → `data/cache` ([`src/cards/cache.ts`](../src/cards/cache.ts)).

Entry for library use (no UI): [`src/index.ts`](../src/index.ts) re-exports the same cache + matcher APIs.

---

## 1. Name search (typeahead)

### UI

| Step | File | What happens |
| --- | --- | --- |
| 1 | [`src/web/public/index.html`](../src/web/public/index.html) | `#q` search input |
| 2 | [`src/web/public/app.js`](../src/web/public/app.js) | `input` → 180 ms debounce → `runSearch(q)` |
| 3 | `app.js` | `fetch('/api/search?q=…&limit=20')` (aborts prior request via `AbortController`) |
| 4 | `app.js` | `renderResults(data.results)` → `#results` list of buttons |

### Server

| Step | File | Function |
| --- | --- | --- |
| 1 | [`src/web/server.ts`](../src/web/server.ts) | `handle()` — `GET /api/search` |
| 2 | same | reads `q`, clamps `limit` to 1…50 (default 25) |
| 3 | [`src/matcher/match.ts`](../src/matcher/match.ts) | `searchCardsByName(cards, q, limit)` |
| 4 | `server.ts` | maps hits through `cardSummary()` + `rank` → JSON |

### Ranking (`searchCardsByName`)

Case-insensitive on `card.name`:

1. **rank 0** — exact match  
2. **rank 1** — name starts with query  
3. **rank 2** — name contains query  

Sorted by rank, then English name; sliced to `limit`. Empty/whitespace query → `[]`.

### Response shape

```json
{
  "query": "reinforcement",
  "results": [
    {
      "id": 32807846,
      "name": "Reinforcement of the Army",
      "type": "Spell Card",
      "race": "Normal",
      "attribute": null,
      "level": null,
      "atk": null,
      "def": null,
      "archetype": null,
      "banlist": null,
      "rank": 1
    }
  ]
}
```

`cardSummary()` always includes `banlist` for transparency; the UI does not filter on it.

---

## 2. Select card → pull matches

### UI

| Step | File | What happens |
| --- | --- | --- |
| 1 | [`src/web/public/app.js`](../src/web/public/app.js) | result button click → `selectCard(card.id)` |
| 2 | `app.js` | `fetch('/api/cards/${id}/pulls')` |
| 3 | `app.js` | fills `#selected-name`, `#selected-meta`, `#selected-desc` from `data.source` |
| 4 | `app.js` | builds flat `#matches` `<ol>` from `data.matches` (name + locations only) |

Listed matches are **not** clickable (no drill-down in v1).

### Server

| Step | File | Function |
| --- | --- | --- |
| 1 | [`src/web/server.ts`](../src/web/server.ts) | `handle()` — `GET /api/cards/:id/pulls` |
| 2 | same | resolves card via `byId.get(id)` (400/404 if bad/missing) |
| 3 | [`src/matcher/match.ts`](../src/matcher/match.ts) | `findPullMatchesById(id, cards)` |
| 4 | same | → `findPullMatches(source, pool)` |
| 5 | `server.ts` | serializes `source`, clause counts, `uncertainClauses`, `matches` |

`GET /api/cards/:id` (without `/pulls`) returns a single card summary + `desc` only — the UI does not use it for matching.

---

## 3. Matching engine (call stack)

All of this runs synchronously in-process against the in-memory `Card[]`.

```
findPullMatchesById(sourceId, pool)          match.ts
  └─ findPullMatches(source, pool)           match.ts
       ├─ parsePullClauses(source.desc)      parse.ts
       │    └─ parseTargetCriteria(target)   parse.ts  (per clause)
       ├─ uncertainClauses = clauses where criteria.uncertain
       ├─ matchable = clauses.filter(clauseIsMatchable)
       └─ for each matchable clause:
            for each card in pool (skip source.id):
              if cardMatchesCriteria(card, clause.criteria)  criteria.ts
                merge into byId map (locations / actions / sources)
       └─ sort matches by card.name → MatchResult
```

### Parse (`src/matcher/parse.ts`)

- `parsePullClauses(desc)` — regex over English effect text:
  - primary: verb + target + `from` + location (`CLAUSE_RE`)
  - secondary: “Target … in … GY; Special Summon …” (`TARGET_THEN_ACT_RE`)
- Skips mill/excavate noise, hand-only send costs, non-pull locations
- `parseTargetCriteria(targetText)` — structured filters: exact names, archetypes, races, attributes, kinds, level/ATK/DEF/link, `except "Name"`, `uncertain` flag

### Matchability (`clauseIsMatchable`)

A clause expands into the list only if it has at least one hard filter (`exactNames`, `archetypes`, `races`, `attributes`, `kinds`, `levels`, `atk`, `def`, `linkval`, or `scales`). Uncertain clauses with no usable filters are reported but **not** expanded (avoids dumping the whole corpus).

### Criteria check (`cardMatchesCriteria`)

AND across present fields; kinds are OR within the kinds list. Banlist is never consulted. Empty criteria → `false`.

### Deduping / sort

Matches are unique by card `id`. Multiple clauses can add locations/actions. Final list is alphabetical by English `name`.

---

## 4. Pulls response shape

```json
{
  "source": {
    "id": 32807846,
    "name": "Reinforcement of the Army",
    "type": "Spell Card",
    "race": "Normal",
    "attribute": null,
    "level": null,
    "atk": null,
    "def": null,
    "archetype": null,
    "banlist": null,
    "desc": "…"
  },
  "clauseCount": 1,
  "uncertainClauseCount": 0,
  "uncertainClauses": [],
  "matchCount": 42,
  "matches": [
    {
      "id": 12345678,
      "name": "…",
      "type": "…",
      "race": "…",
      "attribute": "…",
      "level": 4,
      "atk": null,
      "def": null,
      "archetype": null,
      "banlist": null,
      "locations": ["deck"],
      "actions": ["add_to_hand"]
    }
  ]
}
```

Notes:

- `uncertainClauses` items expose `action`, `locations`, `sourceText`, `rawTargetText` (not full criteria).
- Engine `PullMatch` also has `sources` (clause snippets); the HTTP layer does **not** currently send them.
- `matchCount` is `matches.length` after dedupe/sort.

---

## 5. How the UI renders the flat list

In [`src/web/public/app.js`](../src/web/public/app.js) `selectCard()`:

1. Shows `#detail`; clears previous matches.
2. Sets summary: `` `${matchCount} match(es) · flat list · no drill-down` ``.
3. If `uncertainClauseCount > 0`, shows `#uncertain-note` pointing at [`docs/matching-coverage.md`](./matching-coverage.md).
4. Empty states:
   - `clauseCount === 0` → “No pull clauses detected…”
   - else → “No matching cards in the TCG pool…”
5. Otherwise appends one `<li>` per match: **name** + **locations** joined with ` / ` (actions are in the JSON but unused in the list markup).

Markup targets: [`index.html`](../src/web/public/index.html) `#matches` (`<ol class="matches">`).

---

## Other API endpoints (same server)

| Method / path | Handler | Purpose |
| --- | --- | --- |
| `GET /api/health` | `createMatcherApp` / `handle` | `cardCount`, `databaseVersion`, `ingestedAt` (UI meta line) |
| `GET /api/meta` | same | full cache meta + pool notes |
| `GET /` + static | `readFile` under `src/web/public/` | HTML / CSS / JS |

---

## Headless path (no browser)

Same engine, no HTTP:

```ts
import {
  loadCardsForMatching,
  searchCardsByName,
  findPullMatches,
} from "../src/index.ts";

const cards = await loadCardsForMatching();
const [hit] = searchCardsByName(cards, "Reinforcement of the Army", 1);
const result = findPullMatches(hit!.card, cards);
// result.matches — flat, alphabetical, banlist ignored
```

Public matcher surface: [`src/matcher/index.ts`](../src/matcher/index.ts).

Tests: [`tests/matcher.test.ts`](../tests/matcher.test.ts), [`tests/matcher-integration.test.ts`](../tests/matcher-integration.test.ts).

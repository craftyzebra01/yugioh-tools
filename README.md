# Yugioh Tools

Tooling for Yu-Gi-Oh! applications, starting with **Card Pull Matcher** (see `specs/`).

## Quick start

```bash
npm install
npm run ingest    # once: download TCG cache into data/cache/
npm test          # matcher + ingest unit tests
npm start         # web UI at http://localhost:8787
```

Requires Node.js 20+.

---

## Card Pull Matcher (v1)

Web app: **name search → select a card → flat list of every card it can potentially pull.**

- Matching is computed automatically from English effect text (no curated links).
- Pool: **TCG English** only (YGOPRODeck `format=tcg` cache).
- “Pull” is broad: Deck, GY, banished, hand+Deck, etc. (not only add-to-hand).
- Banlist is **ignored** for display.
- No drill-down, reverse lookup, deckbuilding, or auth in v1.

Product spec: [`specs/card-pull-matcher-v1.md`](./specs/card-pull-matcher-v1.md).  
Coverage / known gaps: [`docs/matching-coverage.md`](./docs/matching-coverage.md).

### Run the app

```bash
npm run ingest    # if data/cache/ is empty
npm start         # PORT=8787 by default
```

Open `http://localhost:8787`. Search by name, click a result, read the flat match list.

API (same server):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Cache status |
| `GET /api/search?q=` | Name search |
| `GET /api/cards/:id/pulls` | Flat pull list for a card |

### Matching library (headless)

```ts
import {
  loadCardsForMatching,
  searchCardsByName,
  findPullMatches,
} from "./src/index.ts";

const cards = await loadCardsForMatching();
const hits = searchCardsByName(cards, "rota"); // or full name
const result = findPullMatches(hits[0]!.card, cards);
// result.matches — alphabetical, deduped; banlist not applied
```

Engine lives under `src/matcher/` and is UI-free so tests can run without a browser.

---

## Card data (ingest)

**Source:** [YGOPRODeck API v7](https://ygoprodeck.com/api-guide/) — bulk `format=tcg` into a **local cache**. Runtime search/matching never hits the live API per user request.

Decision: [`specs/card-data-source.md`](./specs/card-data-source.md). Details: [`docs/card-data.md`](./docs/card-data.md).

```bash
npm run ingest              # full TCG dump → data/cache/
npm run refresh             # skip if database_version unchanged
npm run ingest -- --force
npm run ingest -- --images --image-sizes small
```

| Path | Purpose |
| --- | --- |
| `data/cache/cards.json` | Normalized TCG cards + ingest meta |
| `data/cache/meta.json` | `database_version`, `last_update`, `ingestedAt`, counts |
| `data/cache/by-id.json` | id → index map |
| `data/images/{full,small,cropped}/` | Re-hosted art (optional) |

### Compliance

- Stay under YGOPRODeck’s **20 req/s** limit (ingest spaces requests).
- **Do not hotlink** images — use `--images` and serve locally.
- Card names, text, and artwork © Konami / rights holders. Credit: “Card data: YGOPRODeck”.

---

## Tests

```bash
npm test          # normalize/cache + matcher fixtures (+ cache integration if ingested)
npm run smoke     # live ingest into a temp dir
npm run typecheck
```

---

## Specs

- [`specs/card-data-source.md`](./specs/card-data-source.md) — data source decision
- [`specs/card-pull-matcher-v1.md`](./specs/card-pull-matcher-v1.md) — product spec

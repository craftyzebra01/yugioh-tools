# Yugioh Tools

Tooling for Yu-Gi-Oh! applications, starting with **Card Pull Matcher** (see `specs/`).

## Card data (v1)

**Source:** [YGOPRODeck API v7](https://ygoprodeck.com/api-guide/) — bulk `format=tcg` ingest into a **local cache**. Name search and pull matching must run against this cache, never live API calls per user request.

Decision details: [`specs/card-data-source.md`](./specs/card-data-source.md).

### Setup

```bash
npm install
```

Requires Node.js 20+.

### Ingest / refresh

```bash
# Full TCG dump → data/cache/cards.json (+ meta.json)
npm run ingest

# Re-check checkDBVer.php; skip if database_version unchanged
npm run refresh

# Force rebuild
npm run ingest -- --force

# Also download & re-host images locally (respects ~10 req/s spacing)
npm run ingest -- --images --image-sizes small
# Optional cap for trials:
npm run ingest -- --images --image-limit 50
```

Cache layout:

| Path | Purpose |
| --- | --- |
| `data/cache/cards.json` | Normalized TCG cards + ingest meta |
| `data/cache/meta.json` | `database_version`, `last_update`, `ingestedAt`, counts |
| `data/cache/by-id.json` | id → index map |
| `data/images/{full,small,cropped}/` | Re-hosted art (optional) |

Banlist (`banlist_info`) is **stored** but must **not** filter v1 UI/matching.

### Tests & smoke

```bash
npm test          # unit tests (normalize + cache, offline)
npm run smoke     # live ingest into a temp dir; asserts ~14k cards with desc
npm run typecheck
```

### Library entry

```ts
import { loadCardsForMatching, ingestTcgCache } from "./src/index.ts";

// Offline matching / name search:
const cards = await loadCardsForMatching(); // reads data/cache
```

Matching logic stays out of this package surface for now — keep it separable when Card Pull Matcher lands.

### Compliance

- Cache aggressively; stay under YGOPRODeck’s **20 req/s** limit (ingest spaces requests).
- **Do not hotlink** `images.ygoprodeck.com` — download with `--images` and serve from your host/CDN.
- Card names, text, and artwork remain © Konami / rights holders. Credit: “Card data: YGOPRODeck”.
- See [`docs/card-data.md`](./docs/card-data.md) for refresh cadence notes and attribution.

## Specs

- [`specs/card-data-source.md`](./specs/card-data-source.md) — data source decision
- [`specs/card-pull-matcher-v1.md`](./specs/card-pull-matcher-v1.md) — product spec (matcher UI not in this PR)

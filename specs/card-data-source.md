# Card data source decision (v1)

**Decision:** Use **YGOPRODeck API v7** as the primary card data source for Card Pull Matcher v1.

**Status:** Decided (2026-09-24)  
**Related:** [card-pull-matcher-v1.md](./card-pull-matcher-v1.md)

---

## Recommendation (one-liner)

**Primary source: YGOPRODeck API v7** — bulk-ingest `format=tcg` into a local cache; match offline against full English `desc` plus structured attributes; re-host images; ignore banlist for display.

---

## Requirements checklist

| Need | YGOPRODeck fit |
| --- | --- |
| TCG English only | `format=tcg` returns cards with a TCG release date; excludes Speed Duel / Rush Duel-only cards |
| Full effect text for auto-matching | `desc` is complete English effect / lore text |
| Attributes for criterion matching (type / level / race / archetype, etc.) | `type`, `race`, `attribute`, `level`, `atk`/`def`, `archetype`, Link/Pendulum fields |
| Banlist | Present as `banlist_info` (`ban_tcg` / `ban_ocg` / `ban_goat`) — **store if useful later; do not filter v1 UI** |
| Well-maintained | Actively updated; `checkDBVer.php` exposes version + last update |
| License / ToS for a web app | Free public API; must cache locally and not hotlink images; card text/art remain © Konami / 4K Media |
| Offline / cached matching | Explicitly designed for local storage of full dumps — ideal for complete matching |

---

## Comparison summary

Evaluated against v1 needs (TCG English, full effect text, attributes, images, rate limits, license/ToS, refresh, offline matching). Snapshot notes from live probes on 2026-09-24.

### 1. YGOPRODeck API v7 (chosen)

| Aspect | Notes |
| --- | --- |
| Coverage | ~14k TCG cards via `https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg` (~20 MB JSON). Full corpus also available without `format`. |
| Effect text | English `desc` suitable for parsing pull effects. |
| Attributes | Type/frame, race (monster type / spell-trap property), attribute, level/rank, ATK/DEF, archetype, Link markers, pendulum scale, `misc=yes` extras (`tcg_date`, `konami_id`, `formats`, …). |
| Images | `card_images` URLs (full / small / cropped). **Must download and re-host** — hotlinking risks IP blacklist. |
| Banlist | `banlist_info` when restricted. |
| Rate limits | 20 req/s; 1-hour block if exceeded. Docs require minimizing live calls via local storage. |
| License / ToS | Free to use; community API with usage rules in the [API guide](https://ygoprodeck.com/api-guide/). No separate open-data license on card content — © Konami. Acceptable for a web app if we cache, attribute reasonably, and re-host images. |
| Refresh | Poll `https://db.ygoprodeck.com/api/v7/checkDBVer.php` (`database_version`, `last_update`). Observed example: `147.07` / `2026-09-23`. |
| Offline matching | **Strong** — one filtered dump + local index is the intended use. |

**Caveats:** Community-maintained (not official Konami). Archetype tagging can be incomplete or subjective for edge cases. Placeholder / non-game cards may appear in dumps — filter known junk if needed. Card text/art copyright remains with Konami regardless of API freedom.

### 2. YAML Yugi (DawnbrandBots) — strong alternative dump

| Aspect | Notes |
| --- | --- |
| Coverage | Aggregate `cards.json` (~14k entries, multi-locale names/text). Includes OCG/TCG (+ prereleases); filter to TCG via English sets / names. |
| Effect text | High-quality `text.en`; strong for matching. |
| Attributes | `monster_type_line`, `attribute`, `level`, `atk`/`def`, `series` (archetype-like), `limit_regulation`. |
| Images | Filenames / Yugipedia-oriented; not a ready hosted image CDN like YGOPRODeck. |
| Banlist | `limit_regulation.tcg` (and OCG/speed). |
| Rate limits | Static GitHub Pages / CDN files — fetch occasionally, not per user request. |
| License / ToS | Pipeline code AGPL-3.0+; **card text still © Konami**. Fine as a data mirror, but AGPL may complicate shipping derived tooling. |
| Refresh | Depends on upstream merge pipeline / GitHub Pages republish. |
| Offline matching | Excellent dump shape; no query API. |

**Why not primary for v1:** Overlaps YGOPRODeck on the fields we need, but adds schema complexity (multi-lang, series vs archetype), weaker first-party image story, and AGPL tooling baggage. Keep as a **fallback / cross-check** if YGOPRODeck gaps appear.

### 3. YGOResources Card Database API — high-quality reference, poor bulk fit

| Aspect | Notes |
| --- | --- |
| Coverage | Konami-ID keyed card + FAQ/Q&A data; English `effectText` and multi-locale. |
| Effect text | Excellent (closer to official DB). |
| Attributes | Present per locale (`cardType`, attribute, level, ATK/DEF, properties, prints). |
| Images | Not the main product of the public JSON paths reviewed. |
| Banlist | Not the focus of the card JSON sample; FAQ/rulings are the differentiator. |
| Rate limits / ToS | **Do not pull the entire DB** via API; cache per request; use `X-Cache-Revision` + `/manifest/`. Full offline dump only by contacting them. |
| Refresh | Manifest/revision invalidation — good for incremental updates once seeded. |
| Offline matching | Weak for v1 without a special dump arrangement. |

**Why not primary for v1:** Matching needs the **full** TCG pool offline. Their guidelines discourage bulk download; contacting for a file is slower and less reproducible for open development.

### 4. Official Konami Card Database — not viable as an API

No documented public JSON API. Site scraping is brittle, against typical ToS/bot expectations, and unsuitable as a product dependency. Use only as a human/manual accuracy check when effect text is disputed.

### 5. YGOJSON (and similar aggregators) — not primary

Aggregates YGOPRODeck + YAML Yugi + Yugipedia. Useful packaging idea, but maturity/freshness varies (e.g. large aggregate files historically broken on GitHub). Prefer talking to the upstream we trust (YGOPRODeck) directly for v1.

---

## Ingest & refresh plan (v1)

### Ingest (build / server-side)

1. Fetch TCG English corpus once (or on schedule):
   - `GET https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg`
   - Optional: `misc=yes` if we want `tcg_date`, `konami_id`, `formats` in the local store.
2. Normalize into an internal schema used by the matcher (at minimum: id/passcode, name, `desc`, type/race/attribute/level/ATK/DEF/archetype, image refs).
3. Persist as a versioned artifact (e.g. JSON/SQLite committed to object storage or generated at deploy time) — **matching runs against this cache**, never against live YGOPRODeck per user search.
4. Download needed card images from `images.ygoprodeck.com` and serve from our own host/CDN. Do not hotlink.

### Runtime

- Name search and pull matching query the **local** dataset only.
- Banlist fields may be stored but **must not** hide matches in v1 UI.

### Refresh

1. Periodically (suggested default: daily cron, or on deploy) call `checkDBVer.php`.
2. If `database_version` (or `last_update`) changed since last ingest, re-download `cardinfo.php?format=tcg`, rebuild the local index, and refresh any new/changed images.
3. Record ingested `database_version` + timestamp in app metadata for debugging completeness after set releases.

Exact cadence remains an open product question in the v1 spec; the mechanism above is the technical recommendation.

### Attribution / compliance notes

- Follow YGOPRODeck API guide: cache aggressively; respect 20 req/s; re-host images.
- Card names, text, and artwork are copyrighted by Konami / rights holders — this decision is about **distribution channel for community machine-readable data**, not ownership of IP. Keep a short credits note in the app (e.g. “Card data: YGOPRODeck”).

---

## Fallback

If YGOPRODeck becomes unavailable or systematically incomplete for new TCG prints, switch ingest to **YAML Yugi** `cards.json` (filter to English/TCG) using the same internal schema. Prefer not to dual-source in v1 unless a concrete accuracy gap forces it.

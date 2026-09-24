# Card Pull Matcher — v1 Spec

## Overview

A web app that helps players find Yu-Gi-Oh! cards and see **every card a selected card can potentially pull**.

In v1, the user searches by name, selects a starting card, and gets a **flat list** of all cards that card’s effects can pull. Matching is derived **automatically from card data/text** (not hand-curated links). The list stays tied to the original selected card — there is no drill-down into another card’s pulls yet.

**Pull** means any effect that retrieves or moves another card from **anywhere** (Deck, GY, banished, etc.), not only classic “add from Deck to hand.”

**Card pool:** TCG (English) only. Banlist status is ignored — Forbidden / Limited / Semi-Limited cards still appear when they match.

---

## Goals

1. Let users find a TCG (English) card by **name search**.
2. On select/click, show a **complete, accurate** flat list of all cards that card can potentially pull.
3. Compute matches **automatically** from card data/text — no manual card-to-card link curation.
4. Treat “pull” broadly: any location source (Deck, GY, banished, etc.), not only Deck → hand.
5. Ignore banlist restrictions for display (show all matching TCG cards).

---

## Non-goals / later

Explicitly **out of v1** (product vision for later):

| Later | Notes |
| --- | --- |
| Deckbuilding tool | Full deck construction flows |
| Combo display | Showing Yu-Gi-Oh combos somehow |
| Reverse lookup | “What can search/pull this card?” |
| Drill-down navigation | Click a match to open that card’s pulls |
| Discovery filters | Extra filters beyond name search for finding cards |
| OCG / Master Duel | Non-TCG (English) pools |
| Manual link curation | Hand-maintained card-to-card edges |

Also out of v1 unless later decided: accounts / auth (not discussed for v1).

---

## User flow

1. User opens the web app.
2. User enters a **card name** (or partial name) in search.
3. User sees search results and **clicks / selects** a starting card.
4. App shows that card’s context plus a **flat list** of all cards it can potentially pull.
5. The list remains scoped to the **original** selected card. Selecting a listed match does **not** navigate into that match’s pull list (no drill-down in v1).
6. User may search again and select a different starting card to see a new list.

---

## Matching rules

- **Source of truth:** Card data/text (effects). Matches are computed programmatically from that data.
- **No curated graph:** Do not rely on hand-authored “A pulls B” links for v1 correctness.
- **Completeness & accuracy:** Matching must be **complete and accurate**, not best-effort or approximate. Every card the selected card can potentially pull (per effect text/data, within the TCG English pool) should appear; false omissions and false inclusions are defects.
- **Definition of pull:** Any effect that pulls / retrieves / moves another card from **any** zone or location called out by the effect (Deck, GY, banished, etc.). Not limited to “add from Deck to hand.”
- **Pool:** Only TCG (English) cards are candidates for search results and match lists.
- **Banlist:** Disregard Forbidden / Limited / Semi-Limited. Matching cards appear regardless of banlist status.

Exact parsing / effect-interpretation edge cases beyond the above are implementation concerns; when ambiguous, prefer completeness consistent with the pull definition and flag uncertainty for follow-up rather than silently dropping matches.

---

## Data & accuracy

- **Pool:** TCG (English) only.
- **Accuracy bar:** Complete and accurate matching from card data/text.
- **Banlist:** Not applied to filtering or ranking in v1.
- **Data source:** **YGOPRODeck API v7** (local TCG cache) — see [card-data-source.md](./card-data-source.md).
- **Updates:** How often card data is refreshed is not decided — see Open questions (ingest/refresh mechanism is documented in the data-source decision).

---

## UI

### v1 surfaces

- **Name search** to locate a starting card.
- **Card selection** (click / select from results).
- **Flat match list** of all cards the selected card can potentially pull, clearly associated with that original card.
- No drill-down from a match into that match’s own pulls.
- No discovery filters beyond name search in v1.
- No deckbuilding, combo viz, or reverse-lookup UI in v1.

### Recommendation (not decided)

**Multi-clause / multi-effect grouping:** Default to a **single flat list** of unique matching cards (dedupe by card identity), ordered alphabetically by name. Optionally show a short secondary label per row (e.g. source location implied by the effect: Deck / GY / banished) when that can be derived reliably — but do **not** require section headers by clause unless usability testing shows the flat list is hard to scan. This is a recommendation only; the interview did not specify grouping.

---

## Open questions / recommendations

Items below were **not decided** by the user. Treat as open questions; recommendations are suggestions only.

| Topic | Status | Recommendation (if any) |
| --- | --- | --- |
| Exact card database / API (e.g. YGOPRODeck) | **Decided** — [card-data-source.md](./card-data-source.md) | **YGOPRODeck API v7** as primary: bulk `format=tcg` ingest + local cache for offline matching; re-host images; store but ignore banlist in v1 UI. YAML Yugi is the fallback dump. |
| Tech stack | Undecided | Choose based on team familiarity; keep matching logic separable from UI so accuracy tests can run headlessly. |
| Multi-clause effect grouping in UI | Undecided | Flat deduped list + optional location labels (see UI recommendation above). |
| Auth / accounts | Not discussed | Out of scope for v1; omit unless a later need appears. |
| Card data refresh cadence | Undecided | Document when new TCG prints enter the pool; aim for a process that keeps matching complete after set releases. |
| Tie-breaking / sort of match list | Undecided | Alphabetical by English name is a sensible default. |
| Presentation of “potential” vs guaranteed pulls (conditions, costs, once-per-turn, etc.) | Undecided | List all cards that *can* be pulled when the effect resolves under some legal game state; do not hide conditional targets in v1 — optionally surface condition text later. |

---

## Summary: v1 vs later

| Capability | v1 | Later |
| --- | --- | --- |
| Name search → select card | Yes | — |
| Flat list of cards it can pull | Yes | — |
| Auto matching from card text/data | Yes | — |
| Complete & accurate matching | Yes | — |
| TCG English only | Yes | OCG / Master Duel possible later |
| Broad “pull” (any location) | Yes | — |
| Ignore banlist | Yes | Filters possible later |
| Drill-down into a match’s pulls | No | Yes |
| Reverse “what pulls this” | No | Yes |
| Deckbuilding | No | Yes |
| Combo display | No | Yes |
| Discovery filters | No | Yes |
| Manual link curation | No | Not required for v1; revisit only if needed |

---

*Source: Project spec interview notes (`internal/spec-interview-notes.md`). Spec authors must not invent user decisions beyond those notes; undecided items belong in Open questions.*

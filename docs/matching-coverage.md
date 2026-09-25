# Matching coverage (v1)

The pull matcher derives targets **automatically from English effect text** in the local YGOPRODeck TCG cache. There is no hand-curated card-to-card graph.

## What v1 parses well

Common PSCT shapes used by classic searchers / mills / revivals:

| Pattern | Example |
| --- | --- |
| Add from Deck | Reinforcement of the Army, Sangan, Terraforming |
| Special Summon from Deck | Lonefire Blossom, Predaplant Ophrys Scorpio |
| Send from Deck to GY | Foolish Burial, Armageddon Knight, Mathematician |
| Target in GY → Special Summon | Monster Reborn |
| Archetype quotes (`"Lightsworn" monster`) | Charge of the Light Brigade |
| `except "Name"` | Predaplant Ophrys Scorpio |
| Hand **or** Deck | Emergency Teleport, One for One |
| Ritual Monster / Ritual Spell / Field Spell kinds | Preparation of Rites, Terraforming |
| Level / ATK / Attribute / Type (race) filters | ROTA, Sangan, Armageddon Knight |
| `mentions "Card Name"` | Mind Shuffle, Clear Cube, Cornfield Coatl |
| `non-<Type> "Archetype" monster` | Vanquish Soul Razen, Gogogo Goblindbergh, K9-04 Noroi |

Costs that only **send from hand** (discard) are **not** treated as pulls.

## Known gaps / limitations

These are intentional honesty markers — not silent failures when we can detect them:

1. **Relational criteria** — “monster with the same Type and Attribute as …”, Small World–style “exactly 1 of the same …”. Marked uncertain; not expanded into a full list.
2. **Declare any name** — Crossout Designator / similar. Not expanded to the entire corpus (would be vacuously huge); flagged when detected as uncertain.
3. **Fusion/Synchro materials “specifically listed”** — e.g. Fusion Deployment. Needs card-text cross-reference; uncertain.
4. **Multi-step / deferred pulls** — excavate then add, “that card”, chain links that need prior clause binding beyond Target→SS.
5. **Opponent’s field takes / control changes** — limited coverage; Deck / GY / banished / hand+deck are the focus.
6. **Archetype tagging** — uses YGOPRODeck `archetype` plus light name heuristics; incomplete tags can omit or over-include edge members.
7. **Non-English / OCG-only** — out of pool by design.
8. **Banlist** — stored on cards but **never** hides matches in v1.
9. **Location span greed** — long clauses with later “from the Extra Deck” restrictions (e.g. summon locks) can still attach `extra_deck` as a source location; targets remain filtered by other criteria.

When a clause is uncertain and has no usable structured filters, it is **omitted** from the flat match list (rather than dumping ~14k cards). The API reports `uncertainClauseCount` for UI notes.

## Tests

- `tests/matcher.test.ts` — offline fixtures for representative searchers + mini pool (includes Mind Shuffle / Vanquish Soul Razen).
- `tests/matcher-integration.test.ts` — live checks against `data/cache` when ingested.

Run: `npm test`.

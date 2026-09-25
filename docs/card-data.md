# Card data ingest & cache

Implements the decision in [`specs/card-data-source.md`](../specs/card-data-source.md).

## Endpoints used

| Call | URL | When |
| --- | --- | --- |
| DB version | `https://db.ygoprodeck.com/api/v7/checkDBVer.php` | Before ingest / on refresh |
| TCG dump | `https://db.ygoprodeck.com/api/v7/cardinfo.php?format=tcg&misc=yes` | On ingest when version changed (or `--force`) |
| Images | `https://images.ygoprodeck.com/...` | Only with `--images`; re-host under `data/images/` |

## Internal schema (minimum)

Each cached card includes: `id`, `name`, `desc` (full English effect/lore), `type` / `race` / `attribute` / `level` / `atk` / `def` / `archetype`, Link/Pendulum fields when present, `banlist` (stored, ignored for v1 display), and `images` (source URLs for refresh + local relative paths after download). Optional `misc` holds `tcg_date`, `konami_id`, `formats`.

## Refresh recommendation

1. Cron or deploy hook runs `npm run refresh`.
2. Script compares remote `database_version` to `data/cache/meta.json`.
3. On change: re-fetch TCG dump, rewrite cache, optionally refresh images (`--images`).

Exact product cadence is still open in the matcher spec; daily is a reasonable default.

## Rate limits & ToS

- Documented ceiling: **20 requests/second**; exceeding may yield a 1-hour block.
- This ingest uses one (or few) bulk calls for card JSON and spaces image downloads (~100 ms apart).
- Hotlinking images risks IP blacklist — always serve from `data/images` or your CDN.
- Attribution in UI/docs: **Card data: YGOPRODeck**. Card content © Konami / 4K Media.

## Fallback

If YGOPRODeck is unavailable or incomplete for new TCG prints, switch ingest to YAML Yugi `cards.json` (English/TCG filter) into the **same** internal schema — do not dual-source in v1 unless a concrete gap forces it.

#!/usr/bin/env node
/**
 * Live smoke check: ingest TCG dump into a temp cache and assert usable desc text.
 * Requires network access to db.ygoprodeck.com.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingestTcgCache } from "../src/ingest/ingest.js";
import { loadCardsForMatching } from "../src/cards/cache.js";

const cacheDir = await mkdtemp(path.join(tmpdir(), "ygo-smoke-"));

try {
  console.log(`Smoke ingest → ${cacheDir}`);
  const result = await ingestTcgCache({
    cacheDir,
    force: true,
    misc: true,
    downloadImages: false,
  });

  const cards = await loadCardsForMatching(cacheDir);
  const withDesc = cards.filter((c) => c.desc && c.desc.trim().length > 0);
  const sample = cards.find((c) => /dark magician/i.test(c.name)) ?? cards[0];

  const report = {
    ok: true,
    databaseVersion: result.dbVersion.database_version,
    cardCount: cards.length,
    withDesc: withDesc.length,
    descCoverage: Number((withDesc.length / cards.length).toFixed(4)),
    sample: sample
      ? {
          id: sample.id,
          name: sample.name,
          descPreview: sample.desc.slice(0, 80),
          type: sample.type,
          hasBanlist: Boolean(sample.banlist),
        }
      : null,
  };

  if (cards.length < 10_000) {
    throw new Error(`Expected ~14k TCG cards, got ${cards.length}`);
  }
  if (report.descCoverage < 0.95) {
    throw new Error(`desc coverage too low: ${report.descCoverage}`);
  }
  if (!sample?.desc) {
    throw new Error("Sample card missing desc");
  }

  console.log(JSON.stringify(report, null, 2));
  console.log("Smoke check passed.");
} finally {
  await rm(cacheDir, { recursive: true, force: true });
}

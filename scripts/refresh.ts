#!/usr/bin/env node
/**
 * CLI: poll checkDBVer.php and re-ingest when the remote DB changed.
 *
 * Usage:
 *   npm run refresh
 *   npm run refresh -- --images
 *
 * Suggested cadence (product still open): daily cron or on deploy.
 */
import { refreshIfNeeded } from "../src/ingest/ingest.js";
import type { ImageSize } from "../src/ingest/images.js";

function parseArgs(argv: string[]) {
  const opts = {
    force: false,
    downloadImages: false,
    imageLimit: undefined as number | undefined,
    imageSizes: ["small"] as ImageSize[],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (a === "--images") opts.downloadImages = true;
    else if (a === "--image-limit") opts.imageLimit = Number(argv[++i]);
    else if (a === "--image-sizes") {
      opts.imageSizes = String(argv[++i])
        .split(",")
        .map((s) => s.trim()) as ImageSize[];
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: npm run refresh -- [--force] [--images] [--image-limit N]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

const result = await refreshIfNeeded({
  force: opts.force,
  downloadImages: opts.downloadImages,
  imageLimit: opts.imageLimit,
  imageSizes: opts.imageSizes,
});

console.log(
  JSON.stringify(
    {
      skipped: result.skipped,
      databaseVersion: result.dbVersion.database_version,
      lastUpdate: result.dbVersion.last_update,
      cardCount: result.cache.meta.cardCount,
      ingestedAt: result.cache.meta.ingestedAt,
    },
    null,
    2,
  ),
);

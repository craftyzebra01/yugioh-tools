#!/usr/bin/env node
/**
 * CLI: bulk-ingest TCG cards from YGOPRODeck into data/cache.
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --force
 *   npm run ingest -- --images --image-limit 20
 */
import { ingestTcgCache } from "../src/ingest/ingest.js";
import type { ImageSize } from "../src/ingest/images.js";

function parseArgs(argv: string[]) {
  const opts = {
    force: false,
    downloadImages: false,
    misc: true,
    imageLimit: undefined as number | undefined,
    imageSizes: ["small"] as ImageSize[],
    cacheDir: undefined as string | undefined,
    imagesDir: undefined as string | undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (a === "--images") opts.downloadImages = true;
    else if (a === "--no-misc") opts.misc = false;
    else if (a === "--image-limit") {
      opts.imageLimit = Number(argv[++i]);
    } else if (a === "--image-sizes") {
      opts.imageSizes = String(argv[++i])
        .split(",")
        .map((s) => s.trim()) as ImageSize[];
    } else if (a === "--cache-dir") {
      opts.cacheDir = argv[++i];
    } else if (a === "--images-dir") {
      opts.imagesDir = argv[++i];
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(1);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: npm run ingest -- [options]

Options:
  --force              Rebuild even if database_version matches
  --images             Download & re-host card images locally
  --image-limit N      Cap image downloads (smoke / partial)
  --image-sizes LIST   Comma list: full,small,cropped (default: small)
  --no-misc            Omit misc=yes (tcg_date / konami_id / formats)
  --cache-dir PATH     Output cache directory (default: data/cache)
  --images-dir PATH    Image output directory (default: data/images)
`);
}

const opts = parseArgs(process.argv.slice(2));

const result = await ingestTcgCache({
  force: opts.force,
  downloadImages: opts.downloadImages,
  misc: opts.misc,
  imageLimit: opts.imageLimit,
  imageSizes: opts.imageSizes,
  cacheDir: opts.cacheDir,
  imagesDir: opts.imagesDir,
});

console.log(
  JSON.stringify(
    {
      skipped: result.skipped,
      databaseVersion: result.dbVersion.database_version,
      cardCount: result.cache.meta.cardCount,
      imagesDownloaded: result.cache.meta.imagesDownloaded,
      imageStats: result.imageStats,
    },
    null,
    2,
  ),
);

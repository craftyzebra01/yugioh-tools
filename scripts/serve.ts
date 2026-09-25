#!/usr/bin/env node
/**
 * Launch the Card Pull Matcher web UI.
 *
 * Prerequisites:
 *   npm install
 *   npm run ingest   # once, creates data/cache/cards.json
 *
 * Usage:
 *   npm start
 *   PORT=9000 npm start
 */
import { access } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_CACHE_DIR,
  cardsPath,
} from "../src/cards/cache.js";
import { createMatcherApp } from "../src/web/server.js";

async function main() {
  const cacheFile = cardsPath(DEFAULT_CACHE_DIR);
  try {
    await access(cacheFile);
  } catch {
    console.error("Card cache missing — the web UI needs a local TCG dump.");
    console.error(`Expected: ${path.resolve(cacheFile)}`);
    console.error("Run first:");
    console.error("  npm run ingest");
    console.error("Then:");
    console.error("  npm start");
    process.exit(1);
  }

  try {
    const app = await createMatcherApp();
    const { port, host } = await app.listen();
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(`Card Pull Matcher listening on http://${displayHost}:${port}`);
    console.log(
      `Loaded ${app.cards.length} TCG cards (DB ${app.meta?.databaseVersion ?? "?"})`,
    );
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    if (code === "EADDRINUSE") {
      const port = process.env.PORT ?? "8787";
      console.error(`Port ${port} is already in use.`);
      console.error(`Stop the other process, or run: PORT=8788 npm start`);
      process.exit(1);
    }
    if (code === "ENOENT") {
      console.error("Card cache missing. Run: npm run ingest");
      process.exit(1);
    }
    throw err;
  }
}

main();

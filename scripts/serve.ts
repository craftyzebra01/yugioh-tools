#!/usr/bin/env node
import { createMatcherApp } from "../src/web/server.js";

async function main() {
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
    if (code === "ENOENT") {
      console.error("Card cache missing. Run: npm run ingest");
      process.exit(1);
    }
    throw err;
  }
}

main();

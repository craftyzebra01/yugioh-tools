/**
 * Minimal HTTP API + static UI for Card Pull Matcher v1.
 * Serves local cache only — never calls YGOPRODeck per request.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCardsForMatching,
  readCacheMeta,
  DEFAULT_CACHE_DIR,
} from "../cards/cache.js";
import type { Card } from "../cards/types.js";
import { findPullMatchesById, searchCardsByName } from "../matcher/match.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");

export interface WebAppOptions {
  port?: number;
  host?: string;
  cacheDir?: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function cardSummary(card: Card) {
  return {
    id: card.id,
    name: card.name,
    type: card.type,
    race: card.race ?? null,
    attribute: card.attribute ?? null,
    level: card.level ?? null,
    atk: card.atk ?? null,
    def: card.def ?? null,
    archetype: card.archetype ?? null,
    // Banlist exposed for transparency but UI must not filter on it
    banlist: card.banlist ?? null,
  };
}

export async function createMatcherApp(options: WebAppOptions = {}) {
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const cards = await loadCardsForMatching(cacheDir);
  const meta = await readCacheMeta(cacheDir);
  const byId = new Map(cards.map((c) => [c.id, c]));

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "internal_error" });
    }
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? "localhost";
    const url = new URL(req.url ?? "/", `http://${host}`);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        cardCount: cards.length,
        databaseVersion: meta?.databaseVersion ?? null,
        ingestedAt: meta?.ingestedAt ?? null,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/meta") {
      sendJson(res, 200, {
        meta,
        cardCount: cards.length,
        source: "ygoprodeck-api-v7",
        pool: "tcg",
        note: "Banlist stored but not applied to search or match lists.",
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/search") {
      const q = url.searchParams.get("q") ?? "";
      const limit = Math.min(
        50,
        Math.max(1, Number(url.searchParams.get("limit") ?? 25) || 25),
      );
      const hits = searchCardsByName(cards, q, limit);
      sendJson(res, 200, {
        query: q,
        results: hits.map((h) => ({ ...cardSummary(h.card), rank: h.rank })),
      });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/cards/")) {
      const parts = pathname.split("/").filter(Boolean);
      // /api/cards/:id or /api/cards/:id/pulls
      const idStr = parts[2];
      const id = Number(idStr);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: "invalid_id" });
        return;
      }
      const card = byId.get(id);
      if (!card) {
        sendJson(res, 404, { error: "not_found" });
        return;
      }

      if (parts[3] === "pulls") {
        const result = findPullMatchesById(id, cards);
        sendJson(res, 200, {
          source: {
            ...cardSummary(card),
            desc: card.desc,
          },
          clauseCount: result?.clauses.length ?? 0,
          uncertainClauseCount: result?.uncertainClauses.length ?? 0,
          uncertainClauses: (result?.uncertainClauses ?? []).map((c) => ({
            action: c.action,
            locations: c.locations,
            sourceText: c.sourceText,
            rawTargetText: c.criteria.rawTargetText,
          })),
          matchCount: result?.matches.length ?? 0,
          matches: (result?.matches ?? []).map((m) => ({
            ...cardSummary(m.card),
            locations: m.locations,
            actions: m.actions,
          })),
        });
        return;
      }

      if (parts.length === 3) {
        sendJson(res, 200, { ...cardSummary(card), desc: card.desc });
        return;
      }
    }

    // Static files
    let rel = pathname === "/" ? "/index.html" : pathname;
    if (rel.includes("..")) {
      sendText(res, 400, "Bad path", "text/plain");
      return;
    }
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      sendText(res, 400, "Bad path", "text/plain");
      return;
    }
    try {
      const data = await readFile(filePath);
      const ext = path.extname(filePath);
      sendText(res, 200, data.toString("utf8"), MIME[ext] ?? "application/octet-stream");
    } catch {
      sendJson(res, 404, { error: "not_found" });
    }
  }

  return {
    server,
    cards,
    meta,
    async listen(): Promise<{ port: number; host: string }> {
      const port = options.port ?? Number(process.env.PORT ?? 8787);
      const host = options.host ?? "0.0.0.0";
      await new Promise<void>((resolve) => {
        server.listen(port, host, () => resolve());
      });
      return { port, host };
    },
    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

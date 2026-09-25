import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import type { Card } from "../cards/types.js";
import { fetchBinary, RateLimiter } from "./http.js";

export const DEFAULT_IMAGES_DIR = path.resolve("data/images");

export type ImageSize = "full" | "small" | "cropped";

export interface DownloadImagesOptions {
  imagesDir?: string;
  sizes?: ImageSize[];
  /** Skip files that already exist on disk. Default true. */
  skipExisting?: boolean;
  rateLimiter?: RateLimiter;
  signal?: AbortSignal;
  /** Max images to download (for smoke tests). */
  limit?: number;
  onProgress?: (done: number, total: number, file: string) => void;
}

function extensionFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || ".jpg";
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download card art from images.ygoprodeck.com into local paths.
 * Spec: must re-host — never hotlink at runtime.
 * Mutates card.images entries with relative local paths.
 */
export async function downloadCardImages(
  cards: Card[],
  options: DownloadImagesOptions = {},
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const imagesDir = options.imagesDir ?? DEFAULT_IMAGES_DIR;
  const sizes: ImageSize[] = options.sizes ?? ["small"];
  const skipExisting = options.skipExisting ?? true;
  const limiter = options.rateLimiter ?? new RateLimiter(100);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let considered = 0;

  const jobs: Array<{
    card: Card;
    imageIndex: number;
    size: ImageSize;
    url: string;
  }> = [];

  for (const card of cards) {
    for (let i = 0; i < card.images.length; i++) {
      const img = card.images[i]!;
      for (const size of sizes) {
        const url = img.source?.[size];
        if (!url) continue;
        jobs.push({ card, imageIndex: i, size, url });
      }
    }
  }

  const limitedJobs =
    typeof options.limit === "number" ? jobs.slice(0, options.limit) : jobs;

  for (const job of limitedJobs) {
    considered++;
    const img = job.card.images[job.imageIndex]!;
    const ext = extensionFromUrl(job.url);
    const rel = path.join(job.size, `${img.id}${ext}`);
    const abs = path.join(imagesDir, rel);

    await mkdir(path.dirname(abs), { recursive: true });

    if (skipExisting && (await exists(abs))) {
      skipped++;
      img[job.size] = rel.replace(/\\/g, "/");
      options.onProgress?.(considered, limitedJobs.length, rel);
      continue;
    }

    try {
      const bytes = await fetchBinary(job.url, {
        rateLimiter: limiter,
        signal: options.signal,
      });
      await writeFile(abs, bytes);
      img[job.size] = rel.replace(/\\/g, "/");
      downloaded++;
      options.onProgress?.(considered, limitedJobs.length, rel);
    } catch (err) {
      failed++;
      console.warn(`Failed to download ${job.url}:`, (err as Error).message);
    }
  }

  return { downloaded, skipped, failed };
}

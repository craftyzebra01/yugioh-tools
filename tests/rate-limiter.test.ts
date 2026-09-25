import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RateLimiter } from "../src/ingest/http.js";

describe("RateLimiter", () => {
  it("spaces calls by minIntervalMs", async () => {
    const limiter = new RateLimiter(50);
    const t0 = Date.now();
    await limiter.wait();
    await limiter.wait();
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 45, `expected >=45ms spacing, got ${elapsed}ms`);
  });
});

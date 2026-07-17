import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";

function fakeDeps() {
  return {
    api: { db: {} as never, botToken: "123:abc", now: () => 1_780_000_000, scanLimiter: { tryAcquire: () => true } as never },
    corsOrigin: undefined,
  };
}

describe("server", () => {
  it("GET /health returns ok", async () => {
    const app = await buildServer(fakeDeps());
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, service: "jemaw-bot" });
    await app.close();
  });

  it("reflects any allowed origin when several are configured", async () => {
    const app = await buildServer({
      ...fakeDeps(),
      corsOrigin: ["https://a.example", "https://b.example"],
    });
    const resB = await app.inject({
      method: "OPTIONS",
      url: "/api/bootstrap",
      headers: { origin: "https://b.example" },
    });
    expect(resB.statusCode).toBe(204);
    expect(resB.headers["access-control-allow-origin"]).toBe("https://b.example");
    expect(resB.headers["vary"]).toContain("origin");
    // Unknown origins fall back to the primary (first) origin, so the
    // browser blocks them — same posture as the single-origin setup.
    const resX = await app.inject({
      method: "OPTIONS",
      url: "/api/bootstrap",
      headers: { origin: "https://evil.example" },
    });
    expect(resX.headers["access-control-allow-origin"]).toBe("https://a.example");
    await app.close();
  });

  it("rejects an API call with no initData (401)", async () => {
    const app = await buildServer(fakeDeps());
    const res = await app.inject({
      method: "GET",
      url: "/api/groups/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

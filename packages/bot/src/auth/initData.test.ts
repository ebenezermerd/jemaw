import { describe, it, expect } from "vitest";
import { verifyInitData, signInitDataForTest } from "./initData.js";

const TOKEN = "123456:TEST-TOKEN";
const NOW = 1_780_000_000;

function makeInitData(authDate: number, userId = 42) {
  return signInitDataForTest(
    {
      auth_date: String(authDate),
      query_id: "AAA",
      user: JSON.stringify({
        id: userId,
        first_name: "Sara",
        username: "sara",
      }),
    },
    TOKEN,
  );
}

describe("verifyInitData", () => {
  it("accepts a valid, fresh signature and parses the user", () => {
    const data = makeInitData(NOW - 10);
    const r = verifyInitData(data, TOKEN, NOW);
    expect(r.ok).toBe(true);
    expect(r.data?.user.id).toBe(42n);
    expect(r.data?.user.firstName).toBe("Sara");
  });

  it("rejects a tampered payload", () => {
    const data = makeInitData(NOW - 10);
    const tampered = data.replace("Sara", "Mallory");
    const r = verifyInitData(tampered, TOKEN, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("rejects a wrong token", () => {
    const data = makeInitData(NOW - 10);
    const r = verifyInitData(data, "999:OTHER", NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("bad_signature");
  });

  it("rejects initData older than 24h", () => {
    const data = makeInitData(NOW - 25 * 60 * 60);
    const r = verifyInitData(data, TOKEN, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("expired");
  });

  it("rejects when hash is missing", () => {
    const r = verifyInitData("auth_date=1&user=%7B%7D", TOKEN, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_hash");
  });
});

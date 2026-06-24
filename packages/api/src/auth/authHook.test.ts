import { describe, it, expect } from "vitest";
import { makeAuthHook } from "./authHook.js";
import type { TokenVerifier } from "./firebase.js";
import type { Db } from "../db.js";

/** A fake db whose only used surface is the app_config select for getAdmins. */
function fakeDb(admins: { emails: string[]; supers?: string[] }): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ key: "admins", value: admins }],
        }),
      }),
    }),
  } as unknown as Db;
}

function fakeReply() {
  const reply = {
    statusCode: 0,
    payload: undefined as unknown,
    code(c: number) {
      this.statusCode = c;
      return this;
    },
    async send(p: unknown) {
      this.payload = p;
      return this;
    },
  };
  return reply;
}

const okVerifier: TokenVerifier = {
  async verify(token: string) {
    if (token === "good") return { uid: "u1", email: "admin@jemaw.et" };
    if (token === "other") return { uid: "u2", email: "stranger@x.com" };
    return null;
  },
};

describe("auth hook", () => {
  it("401s when the bearer token is missing", async () => {
    const hook = makeAuthHook({ db: fakeDb({ emails: [] }), verifier: okVerifier });
    const req = { headers: {} } as never;
    const reply = fakeReply();
    await hook(req, reply as never);
    expect(reply.statusCode).toBe(401);
  });

  it("401s when the token is invalid", async () => {
    const hook = makeAuthHook({ db: fakeDb({ emails: ["admin@jemaw.et"] }), verifier: okVerifier });
    const req = { headers: { authorization: "Bearer nope" } } as never;
    const reply = fakeReply();
    await hook(req, reply as never);
    expect(reply.statusCode).toBe(401);
  });

  it("403s when the verified email is not on the allowlist", async () => {
    const hook = makeAuthHook({
      db: fakeDb({ emails: ["admin@jemaw.et"] }),
      verifier: okVerifier,
    });
    const req = { headers: { authorization: "Bearer other" } } as { headers: Record<string, string>; admin?: unknown };
    const reply = fakeReply();
    await hook(req as never, reply as never);
    expect(reply.statusCode).toBe(403);
    expect(req.admin).toBeUndefined();
  });

  it("attaches req.admin with super role for an allowed super", async () => {
    const hook = makeAuthHook({
      db: fakeDb({ emails: ["admin@jemaw.et"], supers: ["admin@jemaw.et"] }),
      verifier: okVerifier,
    });
    const req = { headers: { authorization: "Bearer good" } } as { headers: Record<string, string>; admin?: { uid: string; email: string | null; role: string } };
    const reply = fakeReply();
    await hook(req as never, reply as never);
    expect(reply.statusCode).toBe(0);
    expect(req.admin).toEqual({ uid: "u1", email: "admin@jemaw.et", role: "super" });
  });
});

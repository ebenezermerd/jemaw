import { describe, it, expect, vi } from "vitest";
import { avatarPath, createAvatarFetcher, verifyAvatarSignature } from "./avatar.js";

describe("avatar links", () => {
  it("signs real Telegram ids and refuses manual members", () => {
    const p = avatarPath("tok", "1468513798")!;
    const sig = new URL(p, "http://x").searchParams.get("s")!;
    expect(p.startsWith("/avatars/1468513798.jpg?s=")).toBe(true);
    expect(verifyAvatarSignature("tok", "1468513798", sig)).toBe(true);
    expect(verifyAvatarSignature("tok", "1468513799", sig)).toBe(false);
    expect(verifyAvatarSignature("other", "1468513798", sig)).toBe(false);
    expect(avatarPath("tok", "-814490836")).toBeNull();
    expect(avatarPath(undefined, "1")).toBeNull();
  });
});

describe("createAvatarFetcher", () => {
  it("fetches the ~160px photo once and caches it", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/getUserProfilePhotos"))
        return Response.json({ ok: true, result: { photos: [[{ file_id: "s", width: 160 }, { file_id: "b", width: 640 }]] } });
      if (u.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/a.jpg" } });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    });
    const get = createAvatarFetcher("tok", { fetchImpl: fetchImpl as unknown as typeof fetch });
    const a = await get("42");
    expect(a?.body).toEqual(new Uint8Array([1, 2, 3]));
    await get("42");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const getFileBody = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(getFileBody).toEqual({ file_id: "s" });
  });

  it("returns null for someone without a photo", async () => {
    const fetchImpl = async () => Response.json({ ok: true, result: { photos: [] } });
    const get = createAvatarFetcher("tok", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await get("7")).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { getGroupId } from "./api.js";

function setUrl(path: string) {
  window.history.replaceState(null, "", path);
}

afterEach(() => {
  setUrl("/");
  delete window.Telegram;
});

describe("getGroupId", () => {
  it("reads the local query override", () => {
    setUrl("/?group=local-group");
    expect(getGroupId()).toBe("local-group");
  });

  it("reads Telegram's direct-link start param from the URL hash", () => {
    setUrl("/#tgWebAppVersion=8.0&tgWebAppStartParam=telegram-group");
    expect(getGroupId()).toBe("telegram-group");
  });

  it("falls back to Telegram initDataUnsafe", () => {
    window.Telegram = {
      WebApp: {
        initData: "",
        initDataUnsafe: { start_param: "unsafe-group" },
        ready: () => undefined,
      },
    };
    expect(getGroupId()).toBe("unsafe-group");
  });
});

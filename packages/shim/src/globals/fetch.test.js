import { describe, it, expect, afterEach } from "vitest";
import { installFetchShim } from "./fetch.js";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function install() {
  let relayed = null;

  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: BROWSER_UA },
    configurable: true,
  });

  globalThis.window = {
    __obsidianVersion: "1.12.7",
    location: { origin: "https://ignis.test" },
    fetch: async (url, init) => {
      relayed = JSON.parse(init.body);

      return {
        ok: true,
        json: async () => ({ status: 200, headers: {}, body: "" }),
      };
    },
  };

  installFetchShim();

  return () => relayed;
}

async function relayedHeaders(init) {
  const relayed = install();

  await window.fetch("https://example.test/api/thing", init);

  return relayed().headers;
}

describe("relayed cross-origin request headers", () => {
  afterEach(() => {
    delete globalThis.window;

    if (realNavigator) {
      Object.defineProperty(globalThis, "navigator", realNavigator);
    } else {
      delete globalThis.navigator;
    }
  });

  it("carries the desktop identity headers the caller left unset", async () => {
    const headers = await relayedHeaders();

    expect(headers["user-agent"]).toContain("obsidian/1.12.7");
    expect(headers["origin"]).toBe("app://obsidian.md");
    expect(headers["sec-ch-ua-platform"]).toBe('"Windows"');
    expect(headers["sec-ch-ua-mobile"]).toBe("?0");
    expect(headers["priority"]).toBe("u=1, i");
    expect(headers["sec-fetch-mode"]).toBe("cors");
    expect(headers["sec-fetch-site"]).toBe("cross-site");
  });

  it("never overrides a header the caller set", async () => {
    const caller = {
      "user-agent": "caller-agent",
      origin: "https://caller.test",
      "sec-ch-ua-platform": '"Android"',
      "sec-ch-ua-mobile": "?1",
      priority: "u=4",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "same-site",
    };

    const headers = await relayedHeaders({
      method: "POST",
      headers: caller,
      body: "{}",
    });

    expect(headers).toMatchObject(caller);
  });
});

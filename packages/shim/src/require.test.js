import { describe, it, expect, beforeAll, afterAll } from "vitest";

describe("window.require", () => {
  const stubs = {
    window: globalThis,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { body: { classList: { contains: () => false } } },
    location: { origin: "http://localhost", href: "http://localhost/" },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };

  beforeAll(async () => {
    Object.assign(globalThis, stubs);
    const { installRequire } = await import("./require.js");
    installRequire();
  });

  afterAll(() => {
    delete globalThis.require;

    for (const key of Object.keys(stubs)) {
      delete globalThis[key];
    }
  });

  it("resolves process and node:process to the process shim", () => {
    const process = window.require("process");

    expect(window.require("node:process")).toBe(process);
    expect(process.cwd()).toBe("/");
    expect(process.platform).toBe("linux");
  });
});

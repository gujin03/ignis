import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isSameOrigin, setDirectFetchHosts, isDirectFetchHost } from "./url.js";

describe("isSameOrigin", () => {
  beforeEach(() => {
    global.window = { location: { origin: "https://vault.example.com" } };
  });

  afterEach(() => {
    delete global.window;
  });

  it("treats a root-relative path as same-origin", () => {
    expect(isSameOrigin("/api/fs/readFile")).toBe(true);
  });

  it("treats a protocol-relative URL as cross-origin", () => {
    expect(isSameOrigin("//evil.com/x")).toBe(false);
  });

  it("matches the page origin and rejects a different host", () => {
    expect(isSameOrigin("https://vault.example.com/x")).toBe(true);
    expect(isSameOrigin("https://evil.com/x")).toBe(false);
  });
});

describe("isDirectFetchHost", () => {
  beforeEach(() => {
    global.window = { location: { origin: "https://vault.example.com" } };
  });

  afterEach(() => {
    setDirectFetchHosts([]);
    delete global.window;
  });

  it("is false when no hosts are configured", () => {
    expect(isDirectFetchHost("https://api.example.com/x")).toBe(false);
  });

  it("matches a configured host exactly", () => {
    setDirectFetchHosts(["api.example.com"]);
    expect(isDirectFetchHost("https://api.example.com/path")).toBe(true);
  });

  it("does not match a host that merely contains a configured host", () => {
    setDirectFetchHosts(["immersivetranslate.com"]);
    expect(isDirectFetchHost("https://evil-immersivetranslate.com/x")).toBe(
      false,
    );
  });

  it("matches case-insensitively and trims entries", () => {
    setDirectFetchHosts([" API.Example.com "]);
    expect(isDirectFetchHost("https://api.example.com/x")).toBe(true);
  });

  it("rejects a host not on the list", () => {
    setDirectFetchHosts(["api.example.com"]);
    expect(isDirectFetchHost("https://other.com/x")).toBe(false);
  });

  it("returns false for a relative or empty URL", () => {
    setDirectFetchHosts(["api.example.com"]);
    expect(isDirectFetchHost("/api/fs/readFile")).toBe(false);
    expect(isDirectFetchHost("")).toBe(false);
  });
});

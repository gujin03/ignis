import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { isValidUserVaultName, stripStoragePrefix } = require(
  "./demo-sessions.js",
);

describe("isValidUserVaultName", () => {
  it("accepts a normal user vault name", () => {
    expect(isValidUserVaultName("My Notes")).toBe(true);
    expect(isValidUserVaultName("vault-1.bak")).toBe(true);
  });

  it("rejects names that collide with the storage-prefix scheme", () => {
    expect(isValidUserVaultName("a__b")).toBe(false);
    expect(isValidUserVaultName("demo-foo")).toBe(false);
  });

  it("rejects empty, non-string, and over-long names", () => {
    expect(isValidUserVaultName("")).toBe(false);
    expect(isValidUserVaultName(null)).toBe(false);
    expect(isValidUserVaultName(undefined)).toBe(false);
    expect(isValidUserVaultName("x".repeat(65))).toBe(false);
  });
});

describe("stripStoragePrefix", () => {
  const prefix = "demo-abc123__";

  it("strips the prefix where it is embedded mid-path", () => {
    expect(stripStoragePrefix("/vaults/demo-abc123__Notes", prefix)).toBe(
      "/vaults/Notes",
    );
  });

  it("leaves a value without the prefix unchanged", () => {
    expect(stripStoragePrefix("/vaults/Notes", prefix)).toBe("/vaults/Notes");
  });

  it("passes non-strings through", () => {
    expect(stripStoragePrefix(undefined, prefix)).toBe(undefined);
  });
});

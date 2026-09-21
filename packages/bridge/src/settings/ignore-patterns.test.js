import { describe, it, expect } from "vitest";
import { appendMissing } from "./ignore-patterns.js";

describe("appendMissing", () => {
  it("appends in order without touching the input", () => {
    const values = [".git", ".trash"];

    expect(appendMissing(values, ["node_modules", "@eaDir"])).toEqual([
      ".git",
      ".trash",
      "node_modules",
      "@eaDir",
    ]);
    expect(values).toEqual([".git", ".trash"]);
  });

  it("skips patterns already in the list", () => {
    expect(appendMissing([".git", "@eaDir"], ["@eaDir", ".git"])).toEqual([
      ".git",
      "@eaDir",
    ]);
  });

  it("skips duplicates within the appended patterns", () => {
    expect(appendMissing([], ["a/*", "a/*", "!a/main.js"])).toEqual([
      "a/*",
      "!a/main.js",
    ]);
  });
});

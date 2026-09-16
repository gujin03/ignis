import { describe, it, expect } from "vitest";
import { assertShim as assert } from "./assert.js";

describe("assert shim", () => {
  it("is callable and throws on a falsy value", () => {
    expect(() => assert(false)).toThrow();
    expect(() => assert(true)).not.toThrow();
  });

  it("equal throws on mismatch and passes on loose match", () => {
    expect(() => assert.equal(1, 2)).toThrow();
    expect(() => assert.equal(1, 1)).not.toThrow();
    expect(() => assert.equal(1, "1")).not.toThrow();
  });

  it("strictEqual distinguishes type", () => {
    expect(() => assert.strictEqual(1, "1")).toThrow();
    expect(() => assert.strictEqual(1, 1)).not.toThrow();
  });

  it("throws() verifies that a function threw", () => {
    expect(() =>
      assert.throws(() => {
        throw new Error("x");
      }),
    ).not.toThrow();

    expect(() => assert.throws(() => {})).toThrow();
  });
});

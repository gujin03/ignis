import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { sanitizeError } = require("./errors.js");

describe("sanitizeError", () => {
  it("exposes the error code but never the message", () => {
    const e = Object.assign(new Error("/abs/path/secret leaked here"), {
      code: "ENOENT",
    });

    expect(sanitizeError(e)).toEqual({ error: "ENOENT", code: "ENOENT" });
  });

  it("falls back to 'internal' with no code when the error has none", () => {
    const result = sanitizeError(new Error("boom with internal detail"));

    expect(result.error).toBe("internal");
    expect(result.code).toBeUndefined();
  });

  it("tolerates null, undefined, and non-error input", () => {
    for (const input of [null, undefined, "a string", 42]) {
      const result = sanitizeError(input);
      expect(result.error).toBe("internal");
      expect(result.code).toBeUndefined();
    }
  });
});

import { describe, it, expect, vi } from "vitest";
import { Readable, Writable } from "./stream.js";

describe("stream shim", () => {
  it("warns once when data-flow methods are used", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    new Readable().read();
    new Writable().write("x");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("[shim:stream]");

    warn.mockRestore();
  });
});

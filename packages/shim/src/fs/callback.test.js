import { describe, it, expect } from "vitest";
import { createFsCallbacks } from "./callback.js";

describe("fs callbacks", () => {
  it("resolves the promise result through the callback", async () => {
    const fakePromises = { readFile: async (p) => `data:${p}` };
    const cb = createFsCallbacks(fakePromises);

    const result = await new Promise((resolve) =>
      cb.readFile("/x", (err, data) => resolve([err, data])),
    );

    expect(result).toEqual([null, "data:/x"]);
  });

  it("passes a rejection to the callback as the error argument", async () => {
    const boom = new Error("nope");
    const fakePromises = {
      stat: async () => {
        throw boom;
      },
    };
    const cb = createFsCallbacks(fakePromises);

    const result = await new Promise((resolve) =>
      cb.stat("/x", (err) => resolve(err)),
    );

    expect(result).toBe(boom);
  });

  it("forwards the arguments that precede the callback", async () => {
    let received = null;
    const fakePromises = {
      mkdir: async (p, opts) => {
        received = [p, opts];
      },
    };
    const cb = createFsCallbacks(fakePromises);

    await new Promise((resolve) =>
      cb.mkdir("/d", { recursive: true }, () => resolve()),
    );

    expect(received).toEqual(["/d", { recursive: true }]);
  });
});

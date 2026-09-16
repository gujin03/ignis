import { describe, it, expect } from "vitest";
import { realpath } from "./realpath.js";
import { createFsPromises } from "./promises.js";

describe("fs realpath shim", () => {
  it("realpath invokes the callback with the path", async () => {
    const result = await new Promise((resolve) =>
      realpath("/a/b.md", (err, p) => resolve(p)),
    );

    expect(result).toBe("/a/b.md");
  });

  it("realpath accepts an options argument before the callback", async () => {
    const result = await new Promise((resolve) =>
      realpath("/a/b.md", "utf8", (err, p) => resolve(p)),
    );

    expect(result).toBe("/a/b.md");
  });
});

describe("fs.promises realpath", () => {
  it("answers locally without touching the transport", async () => {
    const fs = createFsPromises({}, {}, {});

    expect(await fs.realpath("/a/b.md")).toBe("/a/b.md");
  });

  it("maps empty and root paths to /", async () => {
    const fs = createFsPromises({}, {}, {});

    expect(await fs.realpath("")).toBe("/");
    expect(await fs.realpath(".")).toBe("/");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { createFsPromises } from "./promises.js";
import { registerPathResolver, _reset } from "./transforms.js";
import { isRecentLocalOp } from "./echo-guard.js";

function makeDeps() {
  const store = new Map();

  const metadataCache = {
    has: (p) => store.has(p),
    get: (p) => (store.has(p) ? store.get(p) : null),
    set: (p, m) => store.set(p, m),
    delete: (p) => store.delete(p),
    toStat: (p) =>
      store.has(p)
        ? {
            type: store.get(p).type,
            isDirectory: () => store.get(p).type === "directory",
            isFile: () => store.get(p).type === "file",
          }
        : null,
    readdir: () => [],
  };

  const contentCache = {
    get: () => null,
    set: vi.fn(),
    delete: vi.fn(),
    invalidate: vi.fn(),
  };

  const transport = {
    mkdir: vi.fn(async () => {}),
    rmdir: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ type: "file", size: 1 })),
    readFile: vi.fn(async () => {
      throw new Error("transport.readFile should not be called");
    }),
  };

  return { metadataCache, contentCache, transport, store };
}

describe("promises directory mutations honor path resolvers", () => {
  afterEach(() => _reset());

  it("mkdir uses the resolved path for cache, echo-guard, and transport", async () => {
    registerPathResolver(
      (p) => p === "logical/dir",
      () => "physical/dir",
    );

    const deps = makeDeps();
    const fs = createFsPromises(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    await fs.mkdir("logical/dir", { recursive: true });

    expect(deps.store.get("physical/dir")).toEqual({ type: "directory" });
    expect(deps.store.has("logical/dir")).toBe(false);
    expect(deps.transport.mkdir).toHaveBeenCalledWith("physical/dir", true);
    expect(isRecentLocalOp("physical/dir")).toBe(true);
    expect(isRecentLocalOp("logical/dir")).toBe(false);
  });

  it("rmdir uses the resolved path for cache, echo-guard, and transport", async () => {
    registerPathResolver(
      (p) => p === "logical/dir",
      () => "physical/dir",
    );

    const deps = makeDeps();
    const fs = createFsPromises(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    deps.store.set("physical/dir", { type: "directory" });

    await fs.rmdir("logical/dir");

    expect(deps.store.has("physical/dir")).toBe(false);
    expect(deps.transport.rmdir).toHaveBeenCalledWith("physical/dir");
    expect(isRecentLocalOp("physical/dir")).toBe(true);
  });
});

describe("promises readFile existence", () => {
  afterEach(() => _reset());

  it("answers ENOENT from the cache for a missing non-redirected path, no transport", async () => {
    const deps = makeDeps();
    const fs = createFsPromises(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    await expect(
      fs.readFile("/.obsidian/backlink.json", "utf8"),
    ).rejects.toThrow(/ENOENT/);
    expect(deps.transport.readFile).not.toHaveBeenCalled();
  });

  it("falls back to the original path for a redirected miss", async () => {
    registerPathResolver(
      (p) => p === ".obsidian/workspace.json",
      () => ".obsidian/workspace.Work.json",
    );

    const deps = makeDeps();
    deps.transport.readFile = vi.fn(async (p) => {
      if (p === ".obsidian/workspace.Work.json") {
        const e = new Error("ENOENT");
        e.code = "ENOENT";
        throw e;
      }

      return "BASE";
    });

    const fs = createFsPromises(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    // Returns the base content after the redirect target 404s: the fallback fired.
    await expect(fs.readFile("/.obsidian/workspace.json", "utf8")).resolves.toBe(
      "BASE",
    );
    expect(deps.transport.readFile).toHaveBeenCalledWith(
      ".obsidian/workspace.Work.json",
      "utf8",
    );
  });
});

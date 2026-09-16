import { describe, it, expect, vi, afterEach } from "vitest";
import { createFsSync } from "./sync.js";
import { resolvePath, registerPathResolver, _reset } from "./transforms.js";
import { isRecentLocalOp } from "./echo-guard.js";

function makeDeps() {
  const store = new Map();

  const metadataCache = {
    has: (p) => store.has(p),
    get: (p) => (store.has(p) ? store.get(p) : null),
    set: (p, m) => store.set(p, m),
    delete: (p) => store.delete(p),
    rename: (a, b) => {
      if (store.has(a)) {
        store.set(b, store.get(a));
        store.delete(a);
      }
    },
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
    rm: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    copyFile: vi.fn(async () => {}),
    appendFile: vi.fn(async () => {}),
    utimes: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ type: "file", size: 1 })),
    readFileSync: vi.fn(() => {
      throw new Error("transport.readFileSync should not be called");
    }),
  };

  return { metadataCache, contentCache, transport, store };
}

describe("sync fs mutations", () => {
  it("lstatSync mirrors statSync", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    deps.store.set(resolvePath("dir"), { type: "directory" });

    expect(fs.lstatSync("dir").isDirectory()).toBe(true);
  });

  it("mkdirSync updates the cache and fires the transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    fs.mkdirSync("newdir", { recursive: true });

    expect(deps.store.get("newdir")).toEqual({ type: "directory" });
    expect(deps.transport.mkdir).toHaveBeenCalledWith("newdir", true);
  });

  it("rmSync deletes from the cache and fires the transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    const key = resolvePath("gone.md");
    deps.store.set(key, { type: "file" });

    fs.rmSync("gone.md", { recursive: true });

    expect(deps.store.has(key)).toBe(false);
    expect(deps.transport.rm).toHaveBeenCalled();
  });

  it("renameSync moves cache metadata and fires the transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    const from = resolvePath("a.md");
    const to = resolvePath("b.md");
    deps.store.set(from, { type: "file", size: 2 });

    fs.renameSync("a.md", "b.md");

    expect(deps.store.has(from)).toBe(false);
    expect(deps.store.get(to)).toEqual({ type: "file", size: 2 });
    expect(deps.transport.rename).toHaveBeenCalled();
  });

  it("copyFileSync optimistically mirrors source metadata and fires the transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    const srcKey = resolvePath("src.md");
    const destKey = resolvePath("dest.md");
    deps.store.set(srcKey, { type: "file", size: 9 });

    fs.copyFileSync("src.md", "dest.md");

    expect(deps.store.get(destKey)).toEqual({ type: "file", size: 9 });
    expect(deps.transport.copyFile).toHaveBeenCalled();
  });

  it("utimesSync sets mtime and fires the transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    const key = resolvePath("note.md");
    deps.store.set(key, { type: "file", mtime: 0 });

    fs.utimesSync("note.md", 111, 222);

    expect(deps.store.get(key).mtime).toBe(222000);
    expect(deps.transport.utimes).toHaveBeenCalledWith(key, 111000, 222000);
  });

  it("utimesSync converts a Date argument to milliseconds", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    const key = resolvePath("note.md");
    deps.store.set(key, { type: "file", mtime: 0 });

    const when = new Date(1783339200000);
    fs.utimesSync("note.md", when, when);

    expect(deps.store.get(key).mtime).toBe(1783339200000);
    expect(deps.transport.utimes).toHaveBeenCalledWith(
      key,
      1783339200000,
      1783339200000,
    );
  });
});

describe("directory mutations honor path resolvers", () => {
  afterEach(() => _reset());

  it("mkdirSync uses the resolved path for cache, echo-guard, and transport", () => {
    registerPathResolver(
      (p) => p === "logical/dir",
      () => "physical/dir",
    );

    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    fs.mkdirSync("logical/dir", { recursive: true });

    expect(deps.store.get("physical/dir")).toEqual({ type: "directory" });
    expect(deps.store.has("logical/dir")).toBe(false);
    expect(deps.transport.mkdir).toHaveBeenCalledWith("physical/dir", true);
    expect(isRecentLocalOp("physical/dir")).toBe(true);
    expect(isRecentLocalOp("logical/dir")).toBe(false);
  });

  it("rmdirSync uses the resolved path for cache, echo-guard, and transport", () => {
    registerPathResolver(
      (p) => p === "logical/dir",
      () => "physical/dir",
    );

    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );
    deps.store.set("physical/dir", { type: "directory" });

    fs.rmdirSync("logical/dir");

    expect(deps.store.has("physical/dir")).toBe(false);
    expect(deps.transport.rmdir).toHaveBeenCalledWith("physical/dir");
    expect(isRecentLocalOp("physical/dir")).toBe(true);
  });
});

describe("readFileSync existence", () => {
  afterEach(() => _reset());

  it("answers ENOENT from the cache for a missing non-redirected path, no transport", () => {
    const deps = makeDeps();
    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    // Leading slash: normalize strips it, so resolved !== the raw argument.
    expect(() => fs.readFileSync("/.obsidian/backlink.json", "utf8")).toThrow(
      /ENOENT/,
    );
    expect(deps.transport.readFileSync).not.toHaveBeenCalled();
  });

  it("falls back to the original path for a redirected miss", () => {
    registerPathResolver(
      (p) => p === ".obsidian/workspace.json",
      () => ".obsidian/workspace.Work.json",
    );

    const deps = makeDeps();
    deps.transport.readFileSync = vi.fn((p) => {
      if (p === ".obsidian/workspace.Work.json") {
        const e = new Error("ENOENT");
        e.code = "ENOENT";
        throw e;
      }

      return "BASE";
    });

    const fs = createFsSync(
      deps.metadataCache,
      deps.contentCache,
      deps.transport,
    );

    // Returns the base content after the redirect target 404s: the fallback fired.
    expect(fs.readFileSync("/.obsidian/workspace.json", "utf8")).toBe("BASE");
    expect(deps.transport.readFileSync).toHaveBeenCalledWith(
      ".obsidian/workspace.Work.json",
      "utf8",
    );
  });
});

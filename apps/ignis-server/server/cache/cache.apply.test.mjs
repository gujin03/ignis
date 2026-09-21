import {
  describe,
  it,
  expect,
  vi,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";
import zlib from "zlib";

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "bootstrap-apply-test-"),
);
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const vaultDir = path.join(VAULT_ROOT, VAULT_ID);
fs.mkdirSync(vaultDir, { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const { watcher } = require("@ignis/server-core");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seed = (relPath, content) => {
  const abs = path.join(vaultDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

const build = () => bootstrapCache.getOrBuild(VAULT_ID);
const apply = (events) => bootstrapCache.applyMutation(VAULT_ID, events);
const fileStat = (size, mtime) => ({ size, mtime, ctime: mtime });
const revisionOf = (etag) => Number(etag.replace(/"/g, "").split("-")[1]);

function runMidCrawl(fn) {
  const realReaddir = fs.promises.readdir;
  let injected = false;

  return vi
    .spyOn(fs.promises, "readdir")
    .mockImplementation(async (dir, opts) => {
      const entries = await realReaddir(dir, opts);

      if (!injected && path.resolve(dir) === path.resolve(vaultDir)) {
        injected = true;
        await fn();
      }

      return entries;
    });
}

beforeEach(() => {
  bootstrapCache.invalidateAll();
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  vi.spyOn(watcher, "isWatching").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("mutation types", () => {
  it("creates a file node", async () => {
    const entry = await build();

    await apply({ type: "created", path: "a.md", stat: fileStat(3, 10) });

    expect(entry.response.tree["a.md"]).toEqual({
      type: "file",
      size: 3,
      mtime: 10,
      ctime: 10,
    });
  });

  it("creates on a modified event for a path it does not hold", async () => {
    const entry = await build();

    await apply({ type: "modified", path: "a.md", stat: fileStat(3, 10) });

    expect(entry.response.tree["a.md"]).toMatchObject({
      type: "file",
      size: 3,
    });
  });

  it("updates an existing file node", async () => {
    seed("a.md", "a");

    const entry = await build();

    await apply({ type: "modified", path: "a.md", stat: fileStat(99, 500) });

    expect(entry.response.tree["a.md"]).toEqual({
      type: "file",
      size: 99,
      mtime: 500,
      ctime: 500,
    });
  });

  it("creates a folder and records its mtime", async () => {
    const entry = await build();

    await apply({
      type: "folder-created",
      path: "notes",
      stat: { mtime: 4242 },
    });

    expect(entry.response.tree["notes"]).toEqual({ type: "directory" });
    expect(entry.dirMtimes["notes"]).toBe(4242);
  });

  it("deletes a file", async () => {
    seed("a.md", "a");

    const entry = await build();

    await apply({ type: "deleted", path: "a.md" });

    expect(entry.response.tree["a.md"]).toBeUndefined();
  });

  it("sweeps a deleted directory out of the tree and the dir mtimes", async () => {
    seed("d/sub/deep.md", "deep");
    seed("keep.md", "keep");

    const entry = await build();

    expect(entry.dirMtimes["d/sub"]).toBeGreaterThan(0);

    await apply({ type: "deleted", path: "d" });

    expect(Object.keys(entry.response.tree)).toEqual(["keep.md"]);
    expect(Object.keys(entry.dirMtimes)).toEqual([""]);
  });

  it("moves a renamed file", async () => {
    seed("a.md", "a");

    const entry = await build();
    const node = entry.response.tree["a.md"];

    await apply({ type: "rename", path: "a.md", toPath: "b.md" });

    expect(entry.response.tree["a.md"]).toBeUndefined();
    expect(entry.response.tree["b.md"]).toBe(node);
  });

  it("moves a renamed directory subtree and its dir mtimes", async () => {
    seed("a/b/c.md", "c");

    const entry = await build();
    const mtime = entry.dirMtimes["a/b"];

    await apply({ type: "rename", path: "a", toPath: "z" });

    expect(entry.response.tree["z"]).toEqual({ type: "directory" });
    expect(entry.response.tree["z/b"]).toEqual({ type: "directory" });
    expect(entry.response.tree["z/b/c.md"]).toMatchObject({ type: "file" });
    expect(
      Object.keys(entry.response.tree).some((k) => k.startsWith("a")),
    ).toBe(false);
    expect(entry.dirMtimes["z/b"]).toBe(mtime);
    expect(entry.dirMtimes["a/b"]).toBeUndefined();
  });

  it("drops what a rename overwrites at the destination", async () => {
    seed("src/one.md", "one");
    seed("dest/two.md", "two");

    const entry = await build();

    await apply({ type: "rename", path: "src", toPath: "dest" });

    expect(entry.response.tree["dest/one.md"]).toMatchObject({ type: "file" });
    expect(entry.response.tree["dest/two.md"]).toBeUndefined();
  });
});

describe("revision", () => {
  it("advances once per applied batch", async () => {
    const entry = await build();
    const before = revisionOf(entry.etag);

    const etag = await apply([
      { type: "created", path: "a.md", stat: fileStat(1, 10) },
      { type: "created", path: "b.md", stat: fileStat(2, 20) },
      { type: "created", path: "c.md", stat: fileStat(3, 30) },
    ]);

    expect(etag).toBe(entry.etag);
    expect(entry.response.etag).toBe(entry.etag);
    expect(revisionOf(entry.etag)).toBe(before + 1);
  });

  it("holds the revision across a no-op", async () => {
    seed("a.md", "a");

    const entry = await build();
    const event = { type: "modified", path: "a.md", stat: fileStat(1, 10) };

    await apply(event);

    const applied = entry.etag;

    await apply(event);
    await apply({ type: "deleted", path: "never-existed.md" });

    expect(entry.etag).toBe(applied);
    expect(await apply(event)).toBe(applied);
  });
});

describe("ancestors and stats", () => {
  it("materializes the directories a deep create passes through", async () => {
    const entry = await build();

    seed("x/y/z.md", "z");

    await apply({ type: "created", path: "x/y/z.md", stat: fileStat(1, 10) });

    expect(entry.response.tree["x"]).toEqual({ type: "directory" });
    expect(entry.response.tree["x/y"]).toEqual({ type: "directory" });
    expect(entry.response.tree["x/y/z.md"]).toMatchObject({ type: "file" });
    expect(entry.dirMtimes["x"]).toBeGreaterThan(0);
    expect(entry.dirMtimes["x/y"]).toBeGreaterThan(0);
  });

  it("stats the path itself when the event carries no stats", async () => {
    const entry = await build();

    seed("a.md", "abcde");

    await apply({ type: "created", path: "a.md" });

    expect(entry.response.tree["a.md"]).toMatchObject({
      type: "file",
      size: 5,
    });
    expect(entry.response.tree["a.md"].mtime).toBeGreaterThan(0);
  });

  it("invalidates when the path it has to stat is gone", async () => {
    seed("a.md", "a");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await build();

    expect(await apply({ type: "created", path: "ghost.md" })).toBeNull();

    const second = await build();

    expect(second).not.toBe(first);
    expect(second.etag).not.toBe(first.etag);
    expect(second.response.tree["ghost.md"]).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("crawls in flight", () => {
  it("replays a mutation onto a crawl that started with an empty slot", async () => {
    seed("a.md", "a");

    const readdirSpy = runMidCrawl(async () => {
      seed("late.md", "late");
      await apply({ type: "created", path: "late.md" });
    });

    const entry = await build();

    readdirSpy.mockRestore();

    expect(entry.response.tree["late.md"]).toMatchObject({ type: "file" });
    expect(await build()).toBe(entry);
  });

  it("applies a mid-crawl mutation to both the live entry and the crawl", async () => {
    seed("a.md", "a");

    const first = await build();

    seed("direct.md", "direct");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const readdirSpy = runMidCrawl(async () => {
      seed("late.md", "late");
      await apply({ type: "created", path: "late.md" });
    });

    await bootstrapCache.reconcileVault(VAULT_ID);

    const second = await build();

    readdirSpy.mockRestore();

    expect(second).not.toBe(first);
    expect(first.response.tree["late.md"]).toMatchObject({ type: "file" });
    expect(second.response.tree["late.md"]).toMatchObject({ type: "file" });
    expect(second.response.tree["direct.md"]).toMatchObject({ type: "file" });
    expect(second.response.etag).toBe(second.etag);
    expect(await build()).toBe(second);
  });

  it("does not store a crawl an invalidation superseded mid-replay", async () => {
    seed("a.md", "a");

    const realStat = fs.promises.stat;
    let armed = false;

    const statSpy = vi
      .spyOn(fs.promises, "stat")
      .mockImplementation(async (p, ...rest) => {
        if (armed && path.resolve(p) === path.resolve(vaultDir, "x")) {
          armed = false;
          bootstrapCache.invalidateVault(VAULT_ID);
        }

        return realStat.call(fs.promises, p, ...rest);
      });

    const readdirSpy = runMidCrawl(async () => {
      seed("x/y/z.md", "z");
      await apply({ type: "created", path: "x/y/z.md" });
      armed = true;
    });

    const served = await build();

    readdirSpy.mockRestore();
    statSpy.mockRestore();

    const next = await build();

    expect(served.response.tree["x/y/z.md"]).toMatchObject({ type: "file" });
    expect(next).not.toBe(served);
    expect(next.etag).not.toBe(served.etag);
    expect(next.response.tree["x/y/z.md"]).toMatchObject({ type: "file" });
  });

  it("does not replay onto a crawl an invalidation superseded", async () => {
    seed("a.md", "a");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const statSpy = vi.spyOn(fs.promises, "stat");

    const readdirSpy = runMidCrawl(async () => {
      await apply({ type: "rename", path: "ghost", toPath: "nowhere" });
      bootstrapCache.invalidateVault(VAULT_ID);
    });

    const served = await build();

    readdirSpy.mockRestore();

    expect(served.response.tree["a.md"]).toMatchObject({ type: "file" });
    expect(
      statSpy.mock.calls.filter(
        ([p]) => path.resolve(p) === path.resolve(vaultDir, "nowhere"),
      ),
    ).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(await build()).not.toBe(served);
  });

  it("replays a delete that raced the crawl of its directory", async () => {
    seed("d/gone.md", "gone");

    const readdirSpy = runMidCrawl(async () => {
      await apply({ type: "deleted", path: "d" });
    });

    const entry = await build();

    readdirSpy.mockRestore();

    expect(entry.response.tree["d"]).toBeUndefined();
    expect(entry.response.tree["d/gone.md"]).toBeUndefined();
    expect(entry.dirMtimes["d"]).toBeUndefined();
  });
});

describe("compression", () => {
  it("serves the built bodies while the entry has not moved", async () => {
    seed("a.md", "a");

    const entry = await build();

    expect(await bootstrapCache.getOrCompress(entry)).toBe(entry.compressed);
  });

  it("recompresses the snapshot an apply produced", async () => {
    seed("a.md", "a");

    const entry = await build();
    const built = entry.compressed;

    await apply({ type: "created", path: "b.md", stat: fileStat(1, 10) });

    const compressed = await bootstrapCache.getOrCompress(entry);

    expect(compressed).not.toBe(built);

    const body = JSON.parse(zlib.brotliDecompressSync(compressed.br));

    expect(body.tree["b.md"]).toMatchObject({ type: "file" });
    expect(body.etag).toBe(entry.etag);
  });

  it("compresses once for concurrent requests", async () => {
    seed("a.md", "a");

    const entry = await build();

    await apply({ type: "created", path: "b.md", stat: fileStat(1, 10) });

    const brotli = vi.spyOn(zlib, "brotliCompress");
    const [one, two] = await Promise.all([
      bootstrapCache.getOrCompress(entry),
      bootstrapCache.getOrCompress(entry),
    ]);

    expect(one).toBe(two);
    expect(brotli).toHaveBeenCalledTimes(1);
    expect(await bootstrapCache.getOrCompress(entry)).toBe(one);
    expect(brotli).toHaveBeenCalledTimes(1);
  });

  it("does not hand a later revision the body of an earlier one", async () => {
    seed("a.md", "a");

    const entry = await build();

    await apply({ type: "created", path: "b.md", stat: fileStat(1, 10) });

    const realBrotli = zlib.brotliCompress;
    let release;
    const held = new Promise((r) => (release = r));

    vi.spyOn(zlib, "brotliCompress").mockImplementation((buf, opts, cb) => {
      held.then(() => realBrotli.call(zlib, buf, opts, cb));
    });

    const early = bootstrapCache.getOrCompress(entry);

    await apply({ type: "created", path: "c.md", stat: fileStat(1, 20) });

    const late = bootstrapCache.getOrCompress(entry);

    release();

    const [earlyBodies, lateBodies] = await Promise.all([early, late]);

    expect(lateBodies).not.toBe(earlyBodies);

    const body = JSON.parse(zlib.brotliDecompressSync(lateBodies.br));

    expect(body.etag).toBe(entry.etag);
    expect(body.tree["c.md"]).toMatchObject({ type: "file" });
    expect(entry.compressed).toBe(lateBodies);
  });

  it("retries a compression that failed while the entry was built", async () => {
    seed("a.md", "a");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = vi
      .spyOn(zlib, "brotliCompress")
      .mockImplementation((buf, opts, cb) => cb(new Error("compress failed")));

    const entry = await build();

    expect(entry.compressed).toEqual({});
    failing.mockRestore();

    const compressed = await bootstrapCache.getOrCompress(entry);

    expect(compressed.br).toBeInstanceOf(Buffer);
    expect(entry.compressed).toBe(compressed);
    expect(warn).toHaveBeenCalled();
  });
});

describe("records with nothing to apply", () => {
  it("skips a path that climbs out of the vault", async () => {
    seed("a.md", "a");

    const entry = await build();
    const etag = entry.etag;
    const statSpy = vi.spyOn(fs.promises, "stat");

    expect(await apply({ type: "created", path: "../escape.md" })).toBe(etag);
    expect(Object.keys(entry.response.tree)).toEqual(["a.md"]);
    expect(statSpy).not.toHaveBeenCalled();
    expect(await build()).toBe(entry);
  });

  it("skips a folder-created whose directory is already gone", async () => {
    seed("a.md", "a");

    const entry = await build();
    const etag = entry.etag;

    expect(await apply({ type: "folder-created", path: "scratch" })).toBe(etag);
    expect(entry.response.tree["scratch"]).toBeUndefined();
    expect(entry.dirMtimes["scratch"]).toBeUndefined();
    expect(await build()).toBe(entry);
  });
});

describe("queue", () => {
  it("drops an apply queued behind an invalidation and recrawls for it", async () => {
    seed("a.md", "a");

    const live = await build();

    seed("c.md", "c");

    const pending = apply({ type: "created", path: "c.md" });

    bootstrapCache.invalidateVault(VAULT_ID);

    expect(await pending).toBeNull();
    expect(live.response.tree["c.md"]).toBeUndefined();

    const rebuilt = await build();

    expect(rebuilt).not.toBe(live);
    expect(rebuilt.response.tree["c.md"]).toMatchObject({ type: "file" });
  });

  it("warns once when a task stops making progress", async () => {
    seed("a.md", "a");

    const entry = await build();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const realStat = fs.promises.stat;
    let release;
    const held = new Promise((r) => (release = r));

    vi.spyOn(fs.promises, "stat").mockImplementation((p, ...rest) =>
      held.then(() => realStat.call(fs.promises, p, ...rest)),
    );
    vi.useFakeTimers();

    const stalled = [];
    let pending;

    try {
      seed("wedged.md", "wedged");
      pending = apply({ type: "created", path: "wedged.md" });

      await vi.advanceTimersByTimeAsync(29 * 1000);

      stalled.push(warn.mock.calls.length);

      await vi.advanceTimersByTimeAsync(2 * 1000);

      stalled.push(warn.mock.calls.length);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

      stalled.push(warn.mock.calls.length);
    } finally {
      vi.useRealTimers();
      release();
    }

    await pending;

    expect(stalled).toEqual([0, 1, 1]);
    expect(warn.mock.calls[0].join(" ")).toBe(
      `[bootstrap] apply queue on vault ${VAULT_ID}: no task has completed in 30s`,
    );
    expect(entry.response.tree["wedged.md"]).toMatchObject({ type: "file" });
  });

  it("applies in unwatched mode, leaving the recorded mtime behind", async () => {
    seed("a.md", "a");
    watcher.isWatching.mockReturnValue(false);

    const first = await build();

    // Windows directory mtime granularity is coarser than back-to-back writes.
    await sleep(50);
    seed("b.md", "b");

    await apply({ type: "created", path: "b.md" });

    expect(first.response.tree["b.md"]).toMatchObject({ type: "file" });
    expect(first.dirMtimes[""]).not.toBe(fs.statSync(vaultDir).mtimeMs);

    const second = await build();

    expect(second).toBe(first);
    expect(second.response.tree["b.md"]).toMatchObject({ type: "file" });
  });
});

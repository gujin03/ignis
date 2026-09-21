import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "cache-ignore-test-"));
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const vaultDir = path.join(VAULT_ROOT, VAULT_ID);
fs.mkdirSync(vaultDir, { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const { watcher, writeCoalescer } = require("@ignis/server-core");

const seed = (relPath, content) => {
  const abs = path.join(vaultDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

const build = () => bootstrapCache.getOrBuild(VAULT_ID);
const reconcile = () => bootstrapCache.reconcileVault(VAULT_ID);

beforeEach(() => {
  bootstrapCache.invalidateAll();
  writeCoalescer._reset();
  writeCoalescer.configure({ writeCoalesceMs: 0 });
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  vi.spyOn(watcher, "isWatching").mockReturnValue(true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  watcher.configure({ ignoredPaths: [".git"] });
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
});

describe("a crawl under a configured ignore list", () => {
  it("keeps the paths in the tree and their directories out of the revalidation set", async () => {
    watcher.configure({ ignoredPaths: ["@eaDir"] });

    seed("a.md", "a");
    seed("@eaDir/thumb.jpg", "t");
    seed("notes/@eaDir/thumb.jpg", "t");

    const entry = await build();

    expect(entry.response.tree["@eaDir/thumb.jpg"]).toMatchObject({
      type: "file",
    });
    expect(entry.dirMtimes["@eaDir"]).toBeUndefined();
    expect(entry.dirMtimes["notes/@eaDir"]).toBeUndefined();
    expect(entry.dirMtimes["notes"]).toEqual(expect.any(Number));
  });

  it("leaves changes under an ignored path out of the reconcile diff", async () => {
    watcher.configure({ ignoredPaths: ["@eaDir"] });

    seed("a.md", "a");
    seed("@eaDir/thumb.jpg", "t");

    const entry = await build();

    seed("@eaDir/second.jpg", "t2");
    fs.rmSync(path.join(vaultDir, "@eaDir", "thumb.jpg"));

    const result = await reconcile();

    expect(result.drifted).toBe(false);
    expect(await build()).toBe(entry);
  });

  it("counts changes under an ignored path as drift when includeIgnored is set", async () => {
    watcher.configure({ ignoredPaths: ["@eaDir"] });

    seed("a.md", "a");
    seed("@eaDir/thumb.jpg", "t");

    await build();

    seed("@eaDir/second.jpg", "t2");
    fs.rmSync(path.join(vaultDir, "@eaDir", "thumb.jpg"));

    const result = await bootstrapCache.reconcileVault(VAULT_ID, {
      includeIgnored: true,
    });

    expect(result.drifted).toBe(true);
  });

  it("does not read a path a new pattern covers as drift", async () => {
    seed("a.md", "a");
    seed("@eaDir/thumb.jpg", "t");

    const entry = await build();

    expect(entry.response.tree["@eaDir/thumb.jpg"]).toMatchObject({
      type: "file",
    });

    watcher.configure({ ignoredPaths: ["@eaDir"] });
    fs.rmSync(path.join(vaultDir, "@eaDir"), { recursive: true, force: true });

    const result = await reconcile();

    expect(result.drifted).toBe(false);
    expect(await build()).toBe(entry);
  });
});

describe("the crawl's heavy-plugin line", () => {
  it("names each heavy plugin once per crawl", async () => {
    const plugin = ".obsidian/plugins/heavy";

    seed(`${plugin}/manifest.json`, "{}");

    for (let i = 0; i < 501; i++) {
      seed(`${plugin}/icons/f${i}.svg`, "s");
    }

    await build();

    const lines = console.log.mock.calls
      .map((args) => args.join(" "))
      .filter((line) => line.includes("[ignore-suggest]"));

    expect(lines).toEqual([
      `[ignore-suggest] vault=${VAULT_ID} plugin=${plugin} ` +
        `files=502 patterns=${plugin}/icons`,
    ]);
  });

  it("says nothing once the pattern is applied", async () => {
    const plugin = ".obsidian/plugins/heavy";

    for (let i = 0; i < 501; i++) {
      seed(`${plugin}/icons/f${i}.svg`, "s");
    }

    watcher.configure({ ignoredPaths: [`${plugin}/icons`] });

    await build();

    const lines = console.log.mock.calls
      .map((args) => args.join(" "))
      .filter((line) => line.includes("[ignore-suggest]"));

    expect(lines).toEqual([]);
  });
});

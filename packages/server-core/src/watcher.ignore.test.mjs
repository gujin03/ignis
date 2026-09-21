import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);
const watcher = require("./watcher.js");

let tmpDir;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  await watcher._reset();

  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("the ignore list before configure runs", () => {
  it("matches .git at any depth and nothing that merely starts with it", () => {
    expect(watcher.isIgnoredPath(".git")).toBe(true);
    expect(watcher.isIgnoredPath(".git/HEAD")).toBe(true);
    expect(watcher.isIgnoredPath(".git/objects/aa/bb")).toBe(true);
    expect(watcher.isIgnoredPath("notes/.git/config")).toBe(true);

    expect(watcher.isIgnoredPath(".gitignore")).toBe(false);
    expect(watcher.isIgnoredPath("notes/.gitignore")).toBe(false);
    expect(watcher.isIgnoredPath("a.git")).toBe(false);
    expect(watcher.isIgnoredPath("notes/a.md")).toBe(false);
  });

  it("reads native separators, a ./ prefix, and a trailing slash", () => {
    expect(
      watcher.isIgnoredPath(["notes", ".git", "HEAD"].join(path.sep)),
    ).toBe(true);
    expect(watcher.isIgnoredPath("./.git/HEAD")).toBe(true);
    expect(watcher.isIgnoredPath(".git/")).toBe(true);
  });

  it("leaves the vault root unmatched", () => {
    expect(watcher.isIgnoredPath("")).toBe(false);
    expect(watcher.isIgnoredPath(null)).toBe(false);
    expect(watcher.isIgnoredPath(undefined)).toBe(false);
  });
});

describe("a configured ignore list", () => {
  it("replaces the previous list rather than adding to it", () => {
    watcher.configure({ ignoredPaths: ["node_modules"] });

    expect(watcher.isIgnoredPath("node_modules/x/y.js")).toBe(true);
    expect(watcher.isIgnoredPath(".git/HEAD")).toBe(false);
  });

  it("matches a bare name at any depth", () => {
    watcher.configure({ ignoredPaths: ["@eaDir"] });

    expect(watcher.isIgnoredPath("@eaDir")).toBe(true);
    expect(watcher.isIgnoredPath("@eaDir/SYNOPHOTO.jpg")).toBe(true);
    expect(watcher.isIgnoredPath("notes/deep/@eaDir/thumb.jpg")).toBe(true);
    expect(watcher.isIgnoredPath("notes/eaDir/a.md")).toBe(false);
  });

  it("treats a leading # as part of the name, not as a comment", () => {
    watcher.configure({ ignoredPaths: ["#recycle"] });

    expect(watcher.isIgnoredPath("#recycle")).toBe(true);
    expect(watcher.isIgnoredPath("#recycle/old.md")).toBe(true);
    expect(watcher.isIgnoredPath("share/#recycle/old.md")).toBe(true);
    expect(watcher.isIgnoredPath("recycle")).toBe(false);
  });

  it("anchors a pattern that carries a slash", () => {
    watcher.configure({ ignoredPaths: [".obsidian/plugins/heavy/icons"] });

    expect(watcher.isIgnoredPath(".obsidian/plugins/heavy/icons")).toBe(true);
    expect(watcher.isIgnoredPath(".obsidian/plugins/heavy/icons/a.svg")).toBe(
      true,
    );
    expect(watcher.isIgnoredPath(".obsidian/plugins/heavy/manifest.json")).toBe(
      false,
    );
    expect(watcher.isIgnoredPath("notes/.obsidian/plugins/heavy/icons")).toBe(
      false,
    );
  });

  it("keeps the files a ! line names out of the excluded directory", () => {
    watcher.configure({
      ignoredPaths: [
        ".obsidian/plugins/heavy/*",
        "!.obsidian/plugins/heavy/manifest.json",
        "!.obsidian/plugins/heavy/main.js",
        "!.obsidian/plugins/heavy/styles.css",
        "!.obsidian/plugins/heavy/data.json",
      ],
    });

    for (const name of [
      "manifest.json",
      "main.js",
      "styles.css",
      "data.json",
    ]) {
      expect(watcher.isIgnoredPath(`.obsidian/plugins/heavy/${name}`)).toBe(
        false,
      );
    }

    expect(watcher.isIgnoredPath(".obsidian/plugins/heavy/icon0001.svg")).toBe(
      true,
    );
    expect(watcher.isIgnoredPath(".obsidian/plugins/heavy/packs/a.svg")).toBe(
      true,
    );
    expect(watcher.isIgnoredPath(".obsidian/plugins/other/main.js")).toBe(
      false,
    );
  });

  it("drops the watcher events under a configured pattern", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-ign-"));
    await fs.promises.mkdir(path.join(tmpDir, "@eaDir"));

    watcher.configure({ ignoredPaths: ["@eaDir"] });

    const events = [];

    watcher.addGlobalListener((vaultId, event) => events.push(event.path));
    watcher.startWatching("ign", tmpDir);

    await sleep(300);
    await fs.promises.writeFile(path.join(tmpDir, "@eaDir", "thumb.jpg"), "x");
    await fs.promises.writeFile(path.join(tmpDir, "kept.md"), "x");

    await vi.waitFor(() => expect(events).toContain("kept.md"), {
      timeout: 5000,
    });
    await sleep(600);

    expect(events).toEqual(["kept.md"]);
  }, 20000);
});

describe("stopAll", () => {
  it("closes every watcher and announces each teardown", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-ign-"));

    const first = path.join(tmpDir, "one");
    const second = path.join(tmpDir, "two");

    await fs.promises.mkdir(first);
    await fs.promises.mkdir(second);

    const rebuilds = [];

    watcher.onWatcherRebuild((vaultId) => rebuilds.push(vaultId));
    watcher.startWatching("one", first);
    watcher.startWatching("two", second);

    await watcher.stopAll();

    expect(watcher.isWatching("one")).toBe(false);
    expect(watcher.isWatching("two")).toBe(false);
    expect(rebuilds.sort()).toEqual(["one", "two"]);
  }, 20000);

  it("resolves with nothing to close when no vault is watched", async () => {
    await expect(watcher.stopAll()).resolves.toEqual([]);
  });
});

describe("pattern compilation", () => {
  it("reports a pattern the matcher cannot compile", () => {
    expect(watcher.canCompileIgnorePattern("?".repeat(60000))).toBe(false);
    expect(watcher.canCompileIgnorePattern("*.tmp")).toBe(true);
  });

  it("treats nothing as ignored when the configured list cannot compile", () => {
    watcher.configure({ ignoredPaths: ["?".repeat(60000)] });

    try {
      expect(watcher.isIgnoredPath("notes/a.md")).toBe(false);
    } finally {
      watcher.configure({ ignoredPaths: [".git"] });
    }
  });
});

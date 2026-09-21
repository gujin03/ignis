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

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "flush-routing-test-"),
);
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const vaultDir = path.join(VAULT_ROOT, VAULT_ID);
fs.mkdirSync(vaultDir, { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const { createMetadataChannel } = require("./metadata-channel");
const { registerCacheListeners } = require("./listeners");
const { watcher, writeCoalescer } = require("@ignis/server-core");

const COALESCE_MS = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const wss = {
  channel: () => ({ broadcastToVault() {} }),
};

registerCacheListeners({
  bootstrapCache,
  metadataChannel: createMetadataChannel(wss),
  watcher,
  writeCoalescer,
});

beforeEach(() => {
  writeCoalescer.configure({ writeCoalesceMs: COALESCE_MS });
  bootstrapCache.invalidateAll();
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
});

afterEach(() => {
  writeCoalescer.configure({ writeCoalesceMs: 0 });
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("a buffered write flushing on an unwatched vault", () => {
  it("replaces the placeholder mtime with the one disk holds", async () => {
    const relPath = "note.md";
    const absPath = path.join(vaultDir, relPath);

    fs.writeFileSync(absPath, "seed");

    await bootstrapCache.getOrBuild(VAULT_ID);

    expect(watcher.isWatching(VAULT_ID)).toBe(false);

    await writeCoalescer.writeCoalesced(absPath, "first", "utf-8");

    const buffered = await writeCoalescer.writeCoalesced(
      absPath,
      "second",
      "utf-8",
    );

    // replicate the write route
    await bootstrapCache.applyMutation(VAULT_ID, {
      type: "modified",
      path: relPath,
      stat: {
        size: buffered.size,
        mtime: buffered.mtime,
        ctime: buffered.mtime,
      },
    });

    const placeholder = await bootstrapCache.getOrBuild(VAULT_ID);

    expect(placeholder.response.tree[relPath].mtime).toBe(buffered.mtime);

    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const flushed = new Promise((resolve) =>
      writeCoalescer.onFlushSuccess(resolve),
    );

    await flushed;
    await bootstrapCache.applyMutation(VAULT_ID, []);

    const corrected = await bootstrapCache.getOrBuild(VAULT_ID);
    const onDisk = fs.statSync(absPath);

    expect(corrected).toBe(placeholder);
    expect(corrected.response.tree[relPath].mtime).toBe(onDisk.mtimeMs);
    expect(corrected.response.tree[relPath].mtime).not.toBe(buffered.mtime);
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining(`vault=${VAULT_ID} build`),
    );
  });

  it("ignores a flush under no configured vault", async () => {
    const outside = path.join(VAULT_ROOT, "loose.md");
    const apply = vi.spyOn(bootstrapCache, "applyMutation");

    await writeCoalescer.writeCoalesced(outside, "first", "utf-8");
    await writeCoalescer.writeCoalesced(outside, "second", "utf-8");

    await sleep(COALESCE_MS + 60);

    expect(fs.readFileSync(outside, "utf-8")).toBe("second");
    expect(apply).not.toHaveBeenCalled();
  });
});

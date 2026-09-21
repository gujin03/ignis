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
  path.join(os.tmpdir(), "verify-wiring-test-"),
);
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const vaultDir = path.join(VAULT_ROOT, VAULT_ID);
fs.mkdirSync(vaultDir, { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const treeReconcile = require("./reconcile");
const { watcher } = require("@ignis/server-core");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = (relPath, content) =>
  fs.writeFileSync(path.join(vaultDir, relPath), content);

const replaced = [];

// replicate the wiring in index.js
bootstrapCache.onStaleEntryServed((vaultId) =>
  treeReconcile.scheduleReconcile(vaultId),
);
bootstrapCache.onEntrySwapped((vaultId, revision) =>
  replaced.push({ vaultId, revision }),
);

beforeEach(() => {
  treeReconcile._reset();
  bootstrapCache.invalidateAll();
  replaced.length = 0;
  fs.rmSync(vaultDir, { recursive: true, force: true });
  fs.mkdirSync(vaultDir, { recursive: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  treeReconcile._reset();
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("a request served an entry disk had moved under", () => {
  it("heals the vault off the back of that one request", async () => {
    seed("a.md", "a");

    const first = await bootstrapCache.getOrBuild(VAULT_ID);

    replaced.length = 0;

    expect(watcher.isWatching(VAULT_ID)).toBe(false);

    // Windows directory mtime granularity is coarser than back-to-back writes.
    await sleep(50);
    seed("outside.md", "outside");

    const served = await bootstrapCache.getOrBuild(VAULT_ID);

    expect(served).toBe(first);
    expect(served.response.tree["outside.md"]).toBeUndefined();

    await treeReconcile._drain();

    const healed = await bootstrapCache.getOrBuild(VAULT_ID);

    expect(healed).not.toBe(first);
    expect(healed.response.tree["outside.md"]).toMatchObject({ type: "file" });
    expect(replaced).toEqual([{ vaultId: VAULT_ID, revision: healed.etag }]);
  });

  it("settles: the request after the verify reports nothing", async () => {
    seed("a.md", "a");

    await bootstrapCache.getOrBuild(VAULT_ID);

    replaced.length = 0;

    await sleep(50);
    seed("outside.md", "outside");

    await bootstrapCache.getOrBuild(VAULT_ID);
    await treeReconcile._drain();

    const settled = await bootstrapCache.getOrBuild(VAULT_ID);

    await treeReconcile._drain();

    expect(await bootstrapCache.getOrBuild(VAULT_ID)).toBe(settled);
    expect(replaced).toHaveLength(1);
  });
});

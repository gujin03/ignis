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

const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "verify-sched-test-"));
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const OTHER_ID = "w";
fs.mkdirSync(path.join(VAULT_ROOT, VAULT_ID), { recursive: true });
fs.mkdirSync(path.join(VAULT_ROOT, OTHER_ID), { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const treeReconcile = require("./reconcile");
const { watcher } = require("@ignis/server-core");

const INTERVAL_MS = 30 * 60 * 1000;
const RECENT_MS = 60 * 1000;
const RELEASE_MS = 300 * 1000;

let verified;

beforeEach(() => {
  vi.useFakeTimers();
  verified = [];
  vi.spyOn(watcher, "isWatching").mockReturnValue(true);
  vi.spyOn(bootstrapCache, "lastCrawlAt").mockReturnValue(0);
  vi.spyOn(bootstrapCache, "reconcileVault").mockImplementation(async (id) => {
    verified.push(id);

    return null;
  });
});

afterEach(() => {
  treeReconcile._reset();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("reconcile when a watcher starts", () => {
  it("verifies the vault the watcher started on", async () => {
    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });

  it("stands down when the vault was crawled moments ago", async () => {
    bootstrapCache.lastCrawlAt.mockReturnValue(Date.now() - RECENT_MS / 2);

    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([]);
  });

  it("verifies once for a watcher that starts twice", async () => {
    treeReconcile.startSchedule(VAULT_ID);
    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });
});

describe("the periodic schedule", () => {
  it("verifies a watched vault every 30 minutes", async () => {
    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID, VAULT_ID, VAULT_ID]);
  });

  it("reconciles a vault whose start reconcile was skipped", async () => {
    bootstrapCache.lastCrawlAt.mockReturnValue(Date.now());

    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([]);

    bootstrapCache.lastCrawlAt.mockReturnValue(0);
    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });

  it("skips a tick that follows a recent crawl", async () => {
    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    bootstrapCache.lastCrawlAt.mockImplementation(() => Date.now());
    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });

  it("drops the schedule of a vault that stopped being watched", async () => {
    treeReconcile.startSchedule(VAULT_ID);

    await treeReconcile._drain();

    watcher.isWatching.mockReturnValue(false);
    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    watcher.isWatching.mockReturnValue(true);
    vi.advanceTimersByTime(INTERVAL_MS * 3);
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });
});

describe("one verify at a time", () => {
  it("holds the second vault until the first is done", async () => {
    let release;
    const held = new Promise((resolve) => (release = resolve));

    bootstrapCache.reconcileVault.mockImplementation(async (id) => {
      verified.push(id);
      await held;

      return null;
    });

    treeReconcile.scheduleReconcile(VAULT_ID);
    treeReconcile.scheduleReconcile(OTHER_ID);

    await Promise.resolve();

    expect(verified).toEqual([VAULT_ID]);

    release();
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID, OTHER_ID]);
  });

  it("releases the slot for a reconcile that never comes back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    bootstrapCache.reconcileVault.mockImplementation((id) => {
      verified.push(id);

      return new Promise(() => {});
    });

    treeReconcile.scheduleReconcile(VAULT_ID);

    await vi.advanceTimersByTimeAsync(1);

    bootstrapCache.reconcileVault.mockImplementation(async (id) => {
      verified.push(id);

      return null;
    });
    treeReconcile.scheduleReconcile(OTHER_ID);

    await vi.advanceTimersByTimeAsync(RELEASE_MS - 1000);

    expect(verified).toEqual([VAULT_ID]);

    await vi.advanceTimersByTimeAsync(2000);

    expect(verified).toEqual([VAULT_ID, OTHER_ID]);
    expect(warn.mock.calls.map((args) => args.join(" "))).toEqual([
      `[tree-reconcile] vault=${VAULT_ID} reconcile has not completed in 300s, ` +
        "resuming schedule",
    ]);
  });

  it("keeps going after a verify throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    bootstrapCache.reconcileVault.mockImplementation(async (id) => {
      verified.push(id);

      throw new Error("crawl failed");
    });

    treeReconcile.scheduleReconcile(VAULT_ID);
    treeReconcile.scheduleReconcile(OTHER_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID, OTHER_ID]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("a request served an entry disk disagrees with", () => {
  it("schedules one verify for a burst of them", async () => {
    let release;
    const held = new Promise((resolve) => (release = resolve));

    bootstrapCache.reconcileVault.mockImplementation(async (id) => {
      verified.push(id);
      await held;

      return null;
    });

    treeReconcile.scheduleReconcile(VAULT_ID);
    treeReconcile.scheduleReconcile(VAULT_ID);
    treeReconcile.scheduleReconcile(VAULT_ID);

    release();
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });

  it("does not stand down for a recent crawl", async () => {
    bootstrapCache.lastCrawlAt.mockImplementation(() => Date.now());

    treeReconcile.scheduleReconcile(VAULT_ID);

    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });
});

describe("teardown", () => {
  it("cancels the schedule of a vault that is going away", async () => {
    treeReconcile.startSchedule(VAULT_ID);
    treeReconcile.startSchedule(OTHER_ID);

    await treeReconcile._drain();

    verified = [];
    treeReconcile.cancelVault(VAULT_ID);

    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    vi.advanceTimersByTime(INTERVAL_MS);
    await treeReconcile._drain();

    expect(verified).toEqual([OTHER_ID, OTHER_ID]);
  });

  it("drops a verify queued for a vault that is going away", async () => {
    let release;
    const held = new Promise((resolve) => (release = resolve));

    bootstrapCache.reconcileVault.mockImplementation(async (id) => {
      verified.push(id);
      await held;

      return null;
    });

    treeReconcile.scheduleReconcile(VAULT_ID);
    treeReconcile.scheduleReconcile(OTHER_ID);
    treeReconcile.cancelVault(OTHER_ID);

    release();
    await treeReconcile._drain();

    expect(verified).toEqual([VAULT_ID]);
  });
});

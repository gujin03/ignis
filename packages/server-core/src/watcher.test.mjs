import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);
const watcher = require("./watcher.js");

const VAULT_ID = "watch-test";

let tmpDir;
let globalListener;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  vi.restoreAllMocks();

  if (globalListener) {
    watcher.removeGlobalListener(globalListener);
    globalListener = null;
  }

  await watcher._reset();
  watcher._setIdleStopMs(null);

  if (tmpDir) {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe("watcher global listeners", () => {
  it("fires with the vault id and event for a direct disk write", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));
    const events = [];
    globalListener = (vaultId, event) => events.push({ vaultId, event });

    watcher.addGlobalListener(globalListener);
    watcher.startWatching(VAULT_ID, tmpDir);

    // Let chokidar's initial scan settle before creating the file it should report.
    await sleep(300);
    await fs.promises.writeFile(path.join(tmpDir, "a.md"), "x");

    await vi.waitFor(() => expect(events.length).toBeGreaterThan(0), {
      timeout: 5000,
    });

    expect(events[0].vaultId).toBe(VAULT_ID);
    expect(events[0].event).toMatchObject({ type: "created", path: "a.md" });
    expect(events[0].event.stat).toMatchObject({
      size: 1,
      mtime: expect.any(Number),
      ctime: expect.any(Number),
    });
  });

  it("stops firing after removeGlobalListener", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));
    const events = [];
    globalListener = (vaultId, event) => events.push({ vaultId, event });

    watcher.addGlobalListener(globalListener);
    watcher.startWatching(VAULT_ID, tmpDir);

    await sleep(300);
    watcher.removeGlobalListener(globalListener);
    await fs.promises.writeFile(path.join(tmpDir, "b.md"), "x");

    // The awaitWriteFinish stabilization window is 300ms; wait well past it.
    await sleep(1500);

    expect(events).toEqual([]);
  });
});

// The window must wait for chokidar's 300ms awaitWriteFinish.
const IDLE_MS = 2000;

describe("watcher idle stop", () => {
  beforeEach(() => {
    watcher._setIdleStopMs(IDLE_MS);
  });

  it("keeps watching until the idle window elapses after the last listener", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));
    const events = [];
    globalListener = (vaultId, event) => events.push(event);

    watcher.addGlobalListener(globalListener);
    watcher.startWatching(VAULT_ID, tmpDir);

    const listener = () => {};
    watcher.addListener(VAULT_ID, listener);

    await sleep(300);
    watcher.removeListener(VAULT_ID, listener);

    await sleep(50);
    await fs.promises.writeFile(path.join(tmpDir, "inside.md"), "x");

    await vi.waitFor(
      () => expect(events.some((e) => e.path === "inside.md")).toBe(true),
      { timeout: IDLE_MS },
    );

    await sleep(IDLE_MS + 500);
    await fs.promises.writeFile(path.join(tmpDir, "after.md"), "x");
    await sleep(1500);

    expect(events.some((e) => e.path === "after.md")).toBe(false);
  }, 20000);

  it("cancels the pending stop when a listener is re-added", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));
    const events = [];
    globalListener = (vaultId, event) => events.push(event);

    watcher.addGlobalListener(globalListener);
    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    const first = () => {};
    watcher.addListener(VAULT_ID, first);

    await sleep(300);
    watcher.removeListener(VAULT_ID, first);
    await sleep(50);
    watcher.addListener(VAULT_ID, () => {});

    await sleep(IDLE_MS + 500);

    expect(watcher.startWatching(VAULT_ID, tmpDir)).toBe(entry);

    await fs.promises.writeFile(path.join(tmpDir, "reconnect.md"), "x");

    await vi.waitFor(
      () => expect(events.some((e) => e.path === "reconnect.md")).toBe(true),
      { timeout: 5000 },
    );
  }, 20000);

  it("cancels the pending stop on an explicit stopWatching", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));

    watcher.startWatching(VAULT_ID, tmpDir);

    const listener = () => {};
    watcher.addListener(VAULT_ID, listener);
    watcher.removeListener(VAULT_ID, listener);

    await expect(watcher.stopWatching(VAULT_ID)).resolves.toBeUndefined();

    const restarted = watcher.startWatching(VAULT_ID, tmpDir);
    watcher.addListener(VAULT_ID, () => {});
    await sleep(IDLE_MS + 500);

    expect(watcher.startWatching(VAULT_ID, tmpDir)).toBe(restarted);
  }, 20000);

  it("stops a watcher that never has a listener", async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));

    watcher.startWatching(VAULT_ID, tmpDir);
    await sleep(IDLE_MS + 500);

    expect(watcher.stopWatching(VAULT_ID)).toBeUndefined();
  }, 20000);
});

function watchError(message, extra) {
  return Object.assign(new Error(message), extra);
}

function whenReady(entry) {
  return new Promise((resolve) => entry.watcher.on("ready", resolve));
}

async function makeVaultDir(fileCount) {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));

  for (let i = 0; i < fileCount; i++) {
    await fs.promises.writeFile(path.join(tmpDir, `f${i}.md`), "x");
  }

  return tmpDir;
}

// nested dir needed for chokidar deletion events.
async function makeNestedVaultDir() {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "watch-test-"));

  const vaultPath = path.join(tmpDir, "vault");

  await fs.promises.mkdir(vaultPath);
  await fs.promises.writeFile(path.join(vaultPath, "a.md"), "x");

  return vaultPath;
}

function countWatched(entry) {
  return Object.values(entry.watcher.getWatched()).reduce(
    (acc, names) => acc + names.length,
    0,
  );
}

describe("watcher start hook", () => {
  it("fires with the vault id after ready on a fresh start", async () => {
    await makeVaultDir(1);
    const starts = [];

    watcher.onWatcherStart((vaultId, info) => starts.push({ vaultId, info }));

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    await whenReady(entry);

    expect(starts).toEqual([
      {
        vaultId: VAULT_ID,
        info: { rebuilt: false, tracked: expect.any(Number), errors: 0 },
      },
    ]);
    expect(starts[0].info.tracked).toBeGreaterThan(0);
  });

  it("reports the tracked count and the error total of a degraded start", async () => {
    await makeVaultDir(3);
    const starts = [];

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    watcher.onWatcherStart((vaultId, info) => starts.push(info));

    const entry = watcher.startWatching(VAULT_ID, tmpDir);
    const ready = whenReady(entry);

    entry.watcher.emit(
      "error",
      watchError("EPERM: operation not permitted, watch", { code: "EPERM" }),
    );

    await ready;

    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ rebuilt: false, errors: 1 });
    expect(starts[0].tracked).toBeGreaterThanOrEqual(3);
    expect(watcher.isWatching(VAULT_ID)).toBe(true);
  });

  it("stops firing after offWatcherStart", async () => {
    await makeVaultDir(1);
    const starts = [];
    const listener = (vaultId, info) => starts.push(info);

    watcher.onWatcherStart(listener);
    watcher.offWatcherStart(listener);

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    await whenReady(entry);

    expect(starts).toEqual([]);
  });
});

describe("isWatching", () => {
  it("turns true at ready and false again once the watcher stops", async () => {
    await makeVaultDir(1);

    expect(watcher.isWatching(VAULT_ID)).toBe(false);

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    expect(watcher.isWatching(VAULT_ID)).toBe(false);

    await whenReady(entry);

    expect(watcher.isWatching(VAULT_ID)).toBe(true);

    await watcher.stopWatching(VAULT_ID);

    expect(watcher.isWatching(VAULT_ID)).toBe(false);
  });
});

describe("watcher liveness rebuild", () => {
  it("replaces a ready watcher that tracks no paths", async () => {
    const vaultPath = await makeNestedVaultDir();
    const starts = [];
    const rebuilds = [];
    const events = [];

    globalListener = (vaultId, event) => events.push(event);
    watcher.addGlobalListener(globalListener);
    watcher.onWatcherStart((vaultId, info) => starts.push(info));
    watcher.onWatcherRebuild((vaultId) => rebuilds.push(vaultId));

    const dead = watcher.startWatching(VAULT_ID, vaultPath);

    watcher.addListener(VAULT_ID, () => {});

    await whenReady(dead);
    await fs.promises.rm(vaultPath, { recursive: true, force: true });

    await vi.waitFor(() => expect(countWatched(dead)).toBe(0), {
      timeout: 5000,
    });

    await fs.promises.mkdir(vaultPath);

    const fresh = watcher.startWatching(VAULT_ID, vaultPath);

    expect(fresh).not.toBe(dead);
    expect(fresh.idleTimer).not.toBeNull();
    expect(dead.listeners.size).toBe(0);
    expect(fresh.listeners.size).toBe(0);

    // teardown occurs in rebuild hook
    expect(rebuilds).toEqual([VAULT_ID]);
    expect(starts).toHaveLength(1);

    await whenReady(fresh);

    expect(starts).toEqual([
      { rebuilt: false, tracked: expect.any(Number), errors: 0 },
      { rebuilt: true, tracked: expect.any(Number), errors: 0 },
    ]);
    expect(starts[1].tracked).toBeGreaterThan(0);
    expect(rebuilds).toEqual([VAULT_ID]);

    await dead.watcher.close();

    await sleep(300);
    await fs.promises.writeFile(path.join(vaultPath, "reborn.md"), "x");

    await vi.waitFor(
      () => expect(events.some((e) => e.path === "reborn.md")).toBe(true),
      { timeout: 5000 },
    );
  }, 20000);

  it("returns the existing entry while it still tracks paths", async () => {
    await makeVaultDir(1);
    const starts = [];
    const rebuilds = [];

    watcher.onWatcherStart((vaultId, info) => starts.push(info));
    watcher.onWatcherRebuild((vaultId) => rebuilds.push(vaultId));

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    await whenReady(entry);

    expect(watcher.startWatching(VAULT_ID, tmpDir)).toBe(entry);
    expect(starts).toEqual([
      { rebuilt: false, tracked: expect.any(Number), errors: 0 },
    ]);
    expect(rebuilds).toEqual([]);
  });

  it("returns an entry that has not reached ready", async () => {
    await makeVaultDir(1);

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    expect(entry.ready).toBe(false);
    expect(watcher.startWatching(VAULT_ID, tmpDir)).toBe(entry);

    await whenReady(entry);
  });
});

describe("watcher scan errors", () => {
  it("logs the first error once and totals the rest on the ready line", async () => {
    await makeVaultDir(5);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entry = watcher.startWatching(VAULT_ID, tmpDir);
    const ready = whenReady(entry);

    for (let i = 0; i < 3; i++) {
      entry.watcher.emit(
        "error",
        watchError("EPERM: operation not permitted, watch", {
          code: "EPERM",
          path: path.join(tmpDir, `f${i}.md`),
        }),
      );
    }

    await ready;

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0].join(" ")).toContain("f0.md");
    expect(entry.errorCount).toBe(3);
    expect(entry.firstError).toMatchObject({ code: "EPERM" });

    expect(warnSpy).toHaveBeenCalledTimes(1);

    const line = warnSpy.mock.calls[0].join(" ");
    const counts = line.match(
      /(\d+) paths tracked, (\d+) errors, ~(-?\d+) watched/,
    );

    expect(counts).not.toBeNull();
    expect(Number(counts[1])).toBeGreaterThanOrEqual(5);
    expect(Number(counts[2])).toBe(3);
    expect(Number(counts[3])).toBe(Number(counts[1]) - 3);
  });

  it("names the inotify limit when a scan error is ENOSPC", async () => {
    await makeVaultDir(2);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entry = watcher.startWatching(VAULT_ID, tmpDir);
    const ready = whenReady(entry);

    entry.watcher.emit(
      "error",
      watchError("ENOSPC: System limit for number of file watchers reached", {
        code: "ENOSPC",
        path: tmpDir,
      }),
    );

    await ready;

    expect(warnSpy.mock.calls[0].join(" ")).toContain(
      "fs.inotify.max_user_watches",
    );
  });

  it("logs every error that arrives after ready", async () => {
    await makeVaultDir(1);

    const entry = watcher.startWatching(VAULT_ID, tmpDir);

    await whenReady(entry);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    entry.watcher.emit("error", watchError("late one"));
    entry.watcher.emit("error", watchError("late two"));

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(entry.errorCount).toBe(0);
  });
});

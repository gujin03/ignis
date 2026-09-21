const { watcher } = require("@ignis/server-core");
const config = require("../config");
const bootstrapCache = require("./index");

// interval between periodic vault reconciliations
const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;

// skip recently crawled vaults
const RECENT_CRAWL_MS = 60 * 1000;

// prevent hanged crawls from blocking other vaults
const RECONCILE_RELEASE_MS = 300 * 1000;

// vaultId -> interval timer
const timers = new Map();

const queuedVaults = new Set();
let runningReconcile = null;
let reconcilingVault = null;

function runReconcile(vaultId) {
  let timer = null;

  const released = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(
        `[tree-reconcile] vault=${vaultId} reconcile has not completed in ` +
          `${Math.round(RECONCILE_RELEASE_MS / 1000)}s, resuming schedule`,
      );
      resolve();
    }, RECONCILE_RELEASE_MS);
    timer.unref?.();
  });

  const work = Promise.resolve()
    .then(() => bootstrapCache.reconcileVault(vaultId))
    .catch((e) => {
      // no need to warn if vault removed mid-crawl
      if (config.getVaultPath(vaultId)) {
        console.warn(`[tree-reconcile] vault=${vaultId} failed:`, e.message);
      }
    })
    .finally(() => clearTimeout(timer));

  return Promise.race([work, released]);
}

function pump() {
  // one crawl at a time, conserves memory
  if (runningReconcile || queuedVaults.size === 0) {
    return;
  }

  const vaultId = queuedVaults.values().next().value;

  queuedVaults.delete(vaultId);
  reconcilingVault = vaultId;

  runningReconcile = runReconcile(vaultId).then(() => {
    runningReconcile = null;
    reconcilingVault = null;
    pump();
  });
}

function scheduleReconcile(vaultId) {
  if (queuedVaults.has(vaultId) || reconcilingVault === vaultId) {
    return;
  }

  queuedVaults.add(vaultId);
  pump();
}

function scheduleUnlessRecent(vaultId) {
  if (Date.now() - bootstrapCache.lastCrawlAt(vaultId) < RECENT_CRAWL_MS) {
    return;
  }

  scheduleReconcile(vaultId);
}

function tick(vaultId) {
  if (!watcher.isWatching(vaultId)) {
    cancelVault(vaultId);

    return;
  }

  scheduleUnlessRecent(vaultId);
}

function startSchedule(vaultId) {
  scheduleUnlessRecent(vaultId);

  if (timers.has(vaultId)) {
    return;
  }

  const timer = setInterval(() => tick(vaultId), RECONCILE_INTERVAL_MS);

  timer.unref?.();
  timers.set(vaultId, timer);
}

function cancelVault(vaultId) {
  clearInterval(timers.get(vaultId));
  timers.delete(vaultId);
  queuedVaults.delete(vaultId);
}

// Test-only.
function _reset() {
  for (const timer of timers.values()) {
    clearInterval(timer);
  }

  timers.clear();
  queuedVaults.clear();
  runningReconcile = null;
  reconcilingVault = null;
}

// Test-only.
async function _drain() {
  while (runningReconcile || queuedVaults.size > 0) {
    pump();
    await runningReconcile;
  }
}

module.exports = {
  startSchedule,
  scheduleReconcile,
  cancelVault,
  _reset,
  _drain,
};

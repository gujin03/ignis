const chokidar = require("chokidar");
const path = require("path");
const ignore = require("ignore");
const { toVaultRel } = require("./path-utils");

const DEFAULT_IGNORED_PATHS = [".git"];

function compileIgnoreList(patterns) {
  // escape '#' to avoid treating it like a gitignore comment
  const lines = patterns.map((line) =>
    line.startsWith("#") ? "\\" + line : line,
  );

  return ignore({ allowRelativePaths: true }).add(lines);
}

let ignoreList = compileIgnoreList(DEFAULT_IGNORED_PATHS);

function canCompileIgnorePattern(pattern) {
  try {
    compileIgnoreList([pattern]).ignores("a/b");
    return true;
  } catch {
    return false;
  }
}

function configure(opts) {
  if (Array.isArray(opts?.ignoredPaths)) {
    ignoreList = compileIgnoreList(opts.ignoredPaths);
  }
}

function isIgnoredPath(p) {
  const rel = toVaultRel(p);

  if (rel === "") {
    return false;
  }

  try {
    return ignoreList.ignores(rel);
  } catch {
    return false;
  }
}

// Idle window before a watcher with no listeners stops.
const IDLE_STOP_MS = 10 * 60 * 1000;

let idleStopMs = IDLE_STOP_MS;

// Per-vault chokidar watchers
// Map<vaultId, { watcher, listeners: Set<fn>, vaultPath, idleTimer, ready, errorCount, firstError, enospc }>
const vaultWatchers = new Map();

// Set<fn(vaultId, event)>, fires for events on all vaults
const globalListeners = new Set();

// Set<fn(vaultId, info)>, fires once per watcher ready
const startListeners = new Set();

// Set<fn(vaultId)>, fires on watcher teardown
const rebuildListeners = new Set();

function cancelIdleStop(entry) {
  clearTimeout(entry.idleTimer);
  entry.idleTimer = null;
}

function countTrackedPaths(watchedDirs) {
  return Object.values(watchedDirs).reduce(
    (acc, names) => acc + names.length,
    0,
  );
}

function notifyStart(vaultId, info) {
  for (const fn of startListeners) {
    try {
      fn(vaultId, info);
    } catch (e) {
      console.error("[watcher] Start listener error:", e);
    }
  }
}

function notifyRebuild(vaultId) {
  for (const fn of rebuildListeners) {
    try {
      fn(vaultId);
    } catch (e) {
      console.error("[watcher] Rebuild listener error:", e);
    }
  }
}

function isDead(entry) {
  return entry.ready && countTrackedPaths(entry.watcher.getWatched()) === 0;
}

function startWatching(vaultId, vaultPath) {
  const existing = vaultWatchers.get(vaultId);
  let rebuilt = false;

  if (existing) {
    if (!isDead(existing)) {
      cancelIdleStop(existing);

      return existing;
    }

    console.warn(
      `[watcher] Rebuilding watcher tracking no paths on vault: ${vaultId}`,
    );
    stopWatching(vaultId);
    notifyRebuild(vaultId);
    rebuilt = true;
  }

  const watcher = chokidar.watch(vaultPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
    ignored: (fullPath) => isIgnoredPath(path.relative(vaultPath, fullPath)),
  });

  const entry = {
    watcher,
    listeners: new Set(),
    vaultPath,
    idleTimer: null,
    ready: false,
    errorCount: 0,
    firstError: null,
    enospc: false,
  };

  function emit(type, fullPath, stat) {
    const rel = toVaultRel(path.relative(vaultPath, fullPath));

    const event = { type, path: rel };

    if (stat) {
      event.stat = {
        size: stat.size,
        mtime: stat.mtimeMs,
        ctime: stat.ctimeMs,
      };
    }

    for (const fn of entry.listeners) {
      try {
        fn(event);
      } catch (e) {
        console.error("[watcher] Listener error:", e);
      }
    }

    for (const fn of globalListeners) {
      try {
        fn(vaultId, event);
      } catch (e) {
        console.error("[watcher] Global listener error:", e);
      }
    }
  }

  watcher
    .on("add", (fullPath, stats) => {
      emit("created", fullPath, stats || null);
    })
    .on("change", (fullPath, stats) => {
      emit("modified", fullPath, stats || null);
    })
    .on("unlink", (fullPath) => {
      emit("deleted", fullPath, null);
    })
    .on("addDir", (fullPath) => {
      // Skip vault root itself
      if (path.resolve(fullPath) === path.resolve(vaultPath)) return;
      emit("folder-created", fullPath, null);
    })
    .on("unlinkDir", (fullPath) => {
      emit("deleted", fullPath, null);
    })
    .on("error", (err) => {
      if (entry.ready) {
        console.error(`[watcher] Error on vault "${vaultId}":`, err.message);

        return;
      }

      entry.errorCount++;
      entry.enospc = entry.enospc || err.code === "ENOSPC";

      if (entry.errorCount === 1) {
        entry.firstError = {
          message: err.message,
          code: err.code,
          path: err.path,
        };

        console.error(
          `[watcher] Error on vault "${vaultId}"${err.path ? ` at ${err.path}` : ""}:`,
          err.message,
        );
      }
    })
    .on("ready", () => {
      entry.ready = true;

      const tracked = countTrackedPaths(watcher.getWatched());

      if (entry.errorCount === 0) {
        console.log(
          `[watcher] Ready on vault "${vaultId}": ${tracked} paths tracked`,
        );
      } else {
        const hint = entry.enospc ? " Raise fs.inotify.max_user_watches." : "";

        console.warn(
          `[watcher] Ready on vault "${vaultId}": ${tracked} paths tracked, ${entry.errorCount} errors, ~${tracked - entry.errorCount} watched.${hint}`,
        );
      }

      notifyStart(vaultId, { rebuilt, tracked, errors: entry.errorCount });
    });

  vaultWatchers.set(vaultId, entry);
  entry.idleTimer = setTimeout(() => stopWatching(vaultId), idleStopMs);
  console.log(`[watcher] Started watching vault: ${vaultId}`);

  return entry;
}

function stopWatching(vaultId) {
  const entry = vaultWatchers.get(vaultId);

  if (!entry) {
    return;
  }

  cancelIdleStop(entry);
  entry.listeners.clear();
  vaultWatchers.delete(vaultId);
  console.log(`[watcher] Stopped watching vault: ${vaultId}`);

  return entry.watcher.close().catch((e) => {
    console.error(`[watcher] Close failed on vault "${vaultId}":`, e.message);
  });
}

function stopAll() {
  const closings = [];

  for (const vaultId of vaultWatchers.keys()) {
    closings.push(stopWatching(vaultId));
    notifyRebuild(vaultId);
  }

  return Promise.all(closings);
}

function isWatching(vaultId) {
  const entry = vaultWatchers.get(vaultId);

  return !!entry && entry.ready;
}

function addGlobalListener(fn) {
  globalListeners.add(fn);
}

function removeGlobalListener(fn) {
  globalListeners.delete(fn);
}

function onWatcherStart(fn) {
  startListeners.add(fn);
}

function offWatcherStart(fn) {
  startListeners.delete(fn);
}

function onWatcherRebuild(fn) {
  rebuildListeners.add(fn);
}

function offWatcherRebuild(fn) {
  rebuildListeners.delete(fn);
}

function addListener(vaultId, fn) {
  const entry = vaultWatchers.get(vaultId);

  if (entry) {
    cancelIdleStop(entry);
    entry.listeners.add(fn);
  }
}

function removeListener(vaultId, fn) {
  const entry = vaultWatchers.get(vaultId);

  if (entry) {
    entry.listeners.delete(fn);

    if (entry.listeners.size === 0) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = setTimeout(() => stopWatching(vaultId), idleStopMs);
    }
  }
}

// Test-only.
function _setIdleStopMs(ms) {
  idleStopMs = ms ?? IDLE_STOP_MS;
}

function _reset() {
  const closings = [];

  for (const vaultId of vaultWatchers.keys()) {
    closings.push(stopWatching(vaultId));
  }

  globalListeners.clear();
  startListeners.clear();
  rebuildListeners.clear();
  ignoreList = compileIgnoreList(DEFAULT_IGNORED_PATHS);

  return Promise.all(closings);
}

module.exports = {
  configure,
  startWatching,
  stopWatching,
  stopAll,
  isWatching,
  isIgnoredPath,
  canCompileIgnorePattern,
  addListener,
  removeListener,
  addGlobalListener,
  removeGlobalListener,
  onWatcherStart,
  offWatcherStart,
  onWatcherRebuild,
  offWatcherRebuild,
  _setIdleStopMs,
  _reset,
};

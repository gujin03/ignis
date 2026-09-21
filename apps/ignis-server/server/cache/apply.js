const fs = require("fs");
const fsp = fs.promises;
const config = require("../config");
const { cache, applyQueues, activeCrawls, nextEtag } = require("./state");
const { toVaultRel, fromVaultRel } = require("@ignis/server-core");
const {
  statFileNode,
  isRepresentable,
  setNode,
  addMissingParentDirs,
  removePath,
  movePath,
} = require("./tree-ops");
const { markCompressionStale } = require("./compress");
const { invalidateVault } = require("./invalidate");

const QUEUE_STALL_THRESHOLD_MS = 30 * 1000;

function startStallTimer(vaultId, queue) {
  queue.stallTimer = setTimeout(() => {
    queue.stallTimer = null;

    console.warn(
      `[bootstrap] apply queue on vault ${vaultId}: no task has completed in ${Math.round(QUEUE_STALL_THRESHOLD_MS / 1000)}s`,
    );
  }, QUEUE_STALL_THRESHOLD_MS);
  queue.stallTimer.unref?.();
}

function clearStallTimer(queue) {
  clearTimeout(queue.stallTimer);
  queue.stallTimer = null;
}

function enqueue(vaultId, task) {
  let queue = applyQueues.get(vaultId);

  if (!queue) {
    queue = { tail: Promise.resolve(), generation: 0, stallTimer: null };
    applyQueues.set(vaultId, queue);
  }

  const generation = queue.generation;
  const gated = () => {
    if (queue.generation !== generation) {
      return null;
    }

    startStallTimer(vaultId, queue);

    return task();
  };
  const settle = () => clearStallTimer(queue);
  const run = queue.tail.then(gated, gated);
  const tail = run.then(settle, settle);

  queue.tail = tail;

  tail.then(() => {
    if (applyQueues.get(vaultId) === queue && queue.tail === tail) {
      applyQueues.delete(vaultId);
    }
  });

  return run;
}

function beginCrawl(vaultId) {
  if (activeCrawls.has(vaultId)) {
    console.warn(
      `[bootstrap] crawl began on vault ${vaultId} while one is active`,
    );
  }

  const crawl = { mutations: [] };

  activeCrawls.set(vaultId, crawl);

  return crawl;
}

function endCrawl(vaultId, crawl) {
  // a superseded crawl must not end the one that replaced it
  if (activeCrawls.get(vaultId) === crawl) {
    activeCrawls.delete(vaultId);
  }
}

function isCrawling(vaultId) {
  return activeCrawls.has(vaultId);
}

async function resolveEvent(vaultPath, event) {
  const relPath = toVaultRel(event.path);

  if (!isRepresentable(relPath)) {
    return null;
  }

  switch (event.type) {
    case "created":
    case "modified": {
      const node = event.stat
        ? {
            type: "file",
            size: event.stat.size,
            mtime: event.stat.mtime,
            ctime: event.stat.ctime,
          }
        : await statFileNode(fromVaultRel(vaultPath, relPath));

      return { type: event.type, path: relPath, node };
    }

    case "folder-created": {
      if (event.stat) {
        return { type: event.type, path: relPath, mtime: event.stat.mtime };
      }

      const s = await fsp
        .stat(fromVaultRel(vaultPath, relPath))
        .catch(() => null);

      return s ? { type: event.type, path: relPath, mtime: s.mtimeMs } : null;
    }

    case "deleted":
      return { type: event.type, path: relPath };

    case "rename": {
      const toPath = toVaultRel(event.toPath);

      return isRepresentable(toPath)
        ? { type: event.type, path: relPath, toPath }
        : null;
    }

    default:
      throw new Error(`unknown mutation type: ${event.type}`);
  }
}

async function applyMutationRecord(vaultPath, entry, mutationRecord) {
  const relPath = mutationRecord.path;

  switch (mutationRecord.type) {
    case "created":
    case "modified": {
      const added = await addMissingParentDirs(vaultPath, entry, relPath);
      const stored = setNode(entry.response.tree, relPath, mutationRecord.node);

      return added || stored;
    }

    case "folder-created": {
      const added = await addMissingParentDirs(vaultPath, entry, relPath);
      const stored = setNode(entry.response.tree, relPath, {
        type: "directory",
      });
      let recorded = false;

      if (entry.dirMtimes[relPath] !== mutationRecord.mtime) {
        entry.dirMtimes[relPath] = mutationRecord.mtime;
        recorded = true;
      }

      return added || stored || recorded;
    }

    case "deleted":
      return removePath(entry, relPath);

    case "rename":
      return movePath(vaultPath, entry, relPath, mutationRecord.toPath);

    default:
      throw new Error(`unknown mutation type: ${mutationRecord.type}`);
  }
}

function bumpRevision(entry) {
  entry.etag = nextEtag();
  entry.response.etag = entry.etag;
  markCompressionStale(entry);
}

function failBatch(vaultId, e) {
  console.warn(`[bootstrap] apply failed on vault ${vaultId}:`, e.message);
  invalidateVault(vaultId);

  return null;
}

async function runBatch(vaultId, batch) {
  const vaultPath = config.getVaultPath(vaultId);
  const entry = cache.get(vaultId);
  const crawl = activeCrawls.get(vaultId);

  if (!vaultPath || (!entry && !crawl)) {
    return null;
  }

  const mutationRecords = [];

  try {
    for (const event of batch) {
      const mutationRecord = await resolveEvent(vaultPath, event);

      if (mutationRecord) {
        mutationRecords.push(mutationRecord);
      }
    }
  } catch (e) {
    return failBatch(vaultId, e);
  }

  if (crawl) {
    crawl.mutations.push(...mutationRecords);
  }

  if (!entry) {
    return null;
  }

  try {
    let changed = false;

    for (const mutationRecord of mutationRecords) {
      const applied = await applyMutationRecord(
        vaultPath,
        entry,
        mutationRecord,
      );
      changed = changed || applied;
    }

    if (changed) {
      bumpRevision(entry);
    }
  } catch (e) {
    return failBatch(vaultId, e);
  }

  return entry.etag;
}

// events: { type, path, stat?, toPath? } | { type, path, stat?, toPath? }[]
function applyMutation(vaultId, events) {
  const batch = Array.isArray(events) ? events : [events];

  return enqueue(vaultId, () => runBatch(vaultId, batch));
}

module.exports = {
  enqueue,
  beginCrawl,
  endCrawl,
  isCrawling,
  applyMutationRecord,
  applyMutation,
};

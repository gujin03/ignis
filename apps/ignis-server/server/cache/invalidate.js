const {
  cache,
  revalidateOnce,
  applyQueues,
  activeCrawls,
  lastCrawls,
  notifyVaultInvalidated,
} = require("./state");

function cancelQueue(vaultId) {
  const queue = applyQueues.get(vaultId);

  if (queue) {
    queue.generation++;
  }
}

function invalidateVault(vaultId) {
  cache.delete(vaultId);
  revalidateOnce.delete(vaultId);
  activeCrawls.delete(vaultId); // stops a running crawl's entry from being stored.
  cancelQueue(vaultId);
  lastCrawls.delete(vaultId);

  notifyVaultInvalidated(vaultId);
}

function invalidateAll() {
  const cached = Array.from(cache.keys());

  cache.clear();
  revalidateOnce.clear();
  activeCrawls.clear();
  lastCrawls.clear();

  for (const vaultId of applyQueues.keys()) {
    cancelQueue(vaultId);
  }

  for (const vaultId of cached) {
    notifyVaultInvalidated(vaultId);
  }
}

function markForRevalidation(vaultId) {
  revalidateOnce.add(vaultId);
}

module.exports = {
  cancelQueue,
  invalidateVault,
  invalidateAll,
  markForRevalidation,
};

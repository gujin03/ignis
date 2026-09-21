const config = require("../config");

function registerCacheListeners({
  bootstrapCache,
  metadataChannel,
  watcher,
  writeCoalescer,
}) {
  bootstrapCache.onEntrySwapped((vaultId, revision) =>
    metadataChannel.reportReplacement(vaultId, revision),
  );

  bootstrapCache.onVaultInvalidated((vaultId) =>
    metadataChannel.forgetVault(vaultId),
  );

  watcher.addGlobalListener((vaultId, event) => {
    bootstrapCache.applyMutation(vaultId, event).then(
      (revision) => {
        try {
          metadataChannel.reportRevision(vaultId, revision);
        } catch (e) {
          console.warn(
            `[metadata] revision announce failed on vault ${vaultId}:`,
            e.message,
          );
        }
      },
      (e) =>
        console.warn(
          `[bootstrap] event apply failed on vault ${vaultId} for ${event.path}:`,
          e.message,
        ),
    );
  });

  writeCoalescer.onFlushSuccess((absPath) => {
    const match = config.vaultForPath(absPath);

    if (!match) {
      return;
    }

    // no stat, read mtime from disk.
    bootstrapCache
      .applyMutation(match.vaultId, { type: "modified", path: match.relPath })
      .catch((e) =>
        console.warn(
          `[bootstrap] flush apply failed on vault ${match.vaultId} for ${match.relPath}:`,
          e.message,
        ),
      );
  });
}

module.exports = { registerCacheListeners };

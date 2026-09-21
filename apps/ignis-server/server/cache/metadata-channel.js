// Announces the revision of a vault's stored tree over the metadata channel.

const CHANNEL = "metadata";

const REVISION_DEBOUNCE_MS = 250;

const REVISION_MAX_WAIT_MS = 2000;

function createMetadataChannel(wss) {
  const channel = wss.channel(CHANNEL);

  // vaultId -> { etag, timer, debounceStart }
  const state = new Map();

  function stateOf(vaultId) {
    let announceState = state.get(vaultId);

    if (!announceState) {
      announceState = { etag: null, timer: null, debounceStart: 0 };
      state.set(vaultId, announceState);
    }

    return announceState;
  }

  function announce(vaultId, announceState) {
    clearTimeout(announceState.timer);
    announceState.timer = null;
    announceState.debounceStart = 0;

    channel.broadcastToVault(vaultId, {
      type: "revision",
      etag: announceState.etag,
    });
  }

  function reportRevision(vaultId, etag) {
    if (!etag) {
      return;
    }

    const announceState = state.get(vaultId);

    if (!announceState || announceState.etag === etag) {
      return;
    }

    announceState.etag = etag;

    if (
      announceState.timer &&
      Date.now() - announceState.debounceStart >= REVISION_MAX_WAIT_MS
    ) {
      announce(vaultId, announceState);

      return;
    }

    if (!announceState.timer) {
      announceState.debounceStart = Date.now();
    }

    clearTimeout(announceState.timer);
    announceState.timer = setTimeout(
      () => announce(vaultId, announceState),
      REVISION_DEBOUNCE_MS,
    );

    announceState.timer.unref?.();
  }

  function reportReplacement(vaultId, etag) {
    const announceState = stateOf(vaultId);

    clearTimeout(announceState.timer);
    announceState.timer = null;
    announceState.debounceStart = 0;
    announceState.etag = etag;

    channel.broadcastToVault(vaultId, { type: "replaced", etag });
  }

  function forgetVault(vaultId) {
    const announceState = state.get(vaultId);

    if (!announceState) {
      return;
    }

    clearTimeout(announceState.timer);
    state.delete(vaultId);
  }

  return { reportRevision, reportReplacement, forgetVault };
}

module.exports = { createMetadataChannel };

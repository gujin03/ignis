const CHANNEL = "plugin:headless-sync";

class SyncBroadcaster {
  constructor(wss) {
    this._channel = wss.channel(CHANNEL);
  }

  broadcastLog(vaultId, line) {
    this._channel.broadcastToVault(vaultId, {
      type: "sync-log",
      payload: { vaultId, line },
    });
  }

  broadcastStatus(state) {
    if (!state || !state.vaultId) {
      return;
    }

    this._channel.broadcastToVault(state.vaultId, {
      type: "sync-status",
      payload: state,
    });
  }
}

module.exports = { SyncBroadcaster };

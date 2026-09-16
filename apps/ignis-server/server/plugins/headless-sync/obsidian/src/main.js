const { Plugin } = require("obsidian");
const { HeadlessSyncSettingTab } = require("./settings-tab");
const { initSyncStatusBar } = require("./sync-status-bar");
const { startCoreSyncGuard } = require("./core-sync-guard");
const api = require("./api");

class IgnisHeadlessSyncPlugin extends Plugin {
  async onload() {
    if (!window.__ignis) {
      console.log(
        "[ignis-headless-sync] Not running in Ignis - plugin is a no-op.",
      );
      return;
    }

    this._syncStatusBarCleanup = initSyncStatusBar(this);

    this.addSettingTab(new HeadlessSyncSettingTab(this.app, this));

    this._coreSyncGuard = startCoreSyncGuard(this, api);

    this.addCommand({
      id: "start-sync",
      name: "Start server-side sync",
      callback: async () => {
        try {
          await api.startSync(this.app.vault.getName());
        } catch (e) {
          console.error("[ignis-headless-sync] Start failed:", e.message);
        }
      },
    });

    this.addCommand({
      id: "stop-sync",
      name: "Stop server-side sync",
      callback: async () => {
        try {
          await api.stopSync(this.app.vault.getName());
        } catch (e) {
          console.error("[ignis-headless-sync] Stop failed:", e.message);
        }
      },
    });

    this.addCommand({
      id: "show-status",
      name: "Show sync status",
      callback: () => {
        this.app.setting.open();
        this.app.setting.openTabById("ignis-headless-sync");
      },
    });

    console.log("[ignis-headless-sync] Loaded");
  }

  onunload() {
    if (!window.__ignis) {
      return;
    }

    window.__ignisHeadlessSyncActive = false;

    if (this._coreSyncGuard) {
      this._coreSyncGuard.cleanup();
      this._coreSyncGuard = null;
    }

    if (this._syncStatusBarCleanup) {
      this._syncStatusBarCleanup();
      this._syncStatusBarCleanup = null;
    }
  }
}

module.exports = IgnisHeadlessSyncPlugin;

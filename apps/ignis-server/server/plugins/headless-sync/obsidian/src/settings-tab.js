const { PluginSettingTab, Setting, Notice } = require("obsidian");
const api = require("./api");
const auth = require("./auth");
const { isCoreSyncEnabled } = require("./core-sync-guard");
const { renderLogViewer } = require("./log-viewer");

class HeadlessSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this._cancelWait = null;
    this._logCleanup = null;

    // Persistent container refs
    this._authEl = null;
    this._syncEl = null;
    this._logsEl = null;
    this._logsRendered = false;
  }

  async display() {
    // Clean up previous log listener before rebuilding
    if (this._logCleanup) {
      this._logCleanup();
      this._logCleanup = null;
    }

    const { containerEl } = this;
    containerEl.empty();

    this._logsRendered = false;

    if (isCoreSyncEnabled()) {
      const syncWarningSetting = new Setting(containerEl)
        .setName("Obsidian Sync is active");

      syncWarningSetting.descEl.createEl("span", {
        text: "Headless Sync cannot run alongside Obsidian's built-in sync to avoid conflicts. Disable Obsidian Sync in Core Plugins to use Headless Sync instead.",
        cls: "mod-warning",
      });

      syncWarningSetting
        .addButton((btn) => {
          btn.setButtonText("Open Core Plugins").onClick(() => {
            this.app.setting.openTabById("plugins");
          });
      });

      return;
    }

    let serverStatus;

    try {
      serverStatus = await api.getStatus();
    } catch {
      containerEl.createEl("p", {
        text: "Failed to connect to Headless Sync server plugin.",
        cls: "mod-warning",
      });
      return;
    }

    if (!serverStatus.installed) {
      containerEl.createEl("p", {
        text: "obsidian-headless (ob CLI) is not installed on the server. Install it to enable sync.",
        cls: "mod-warning",
      });
      return;
    }

    this._authEl = containerEl.createDiv();
    this._syncEl = containerEl.createDiv();
    this._logsEl = containerEl.createDiv();

    this.renderAuthSection(serverStatus);
    await this.renderSyncSection(serverStatus.authenticated);
  }

  renderAuthSection(serverStatus) {
    this._authEl.empty();

    const localToken = auth.getObsidianSyncToken();

    if (serverStatus.authenticated) {
      new Setting(this._authEl)
        .setName("Obsidian Sync account")
        .setDesc(
          `Signed in as ${serverStatus.name || "unknown"} (${serverStatus.email || "unknown"})`,
        )
        .addButton((btn) => {
          btn.setButtonText("Disconnect");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api.logout();
              new Notice("Disconnected from Headless Sync");
              const status = await api.getStatus();
              this.renderAuthSection(status);
              await this.renderSyncSection(status.authenticated);
            } catch (e) {
              new Notice(`Failed to disconnect: ${e.message}`);
            }
          });
        });
    } else if (localToken) {
      new Setting(this._authEl)
        .setName("Obsidian Sync account detected")
        .setDesc(`${localToken.name} (${localToken.email})`)
        .addButton((btn) => {
          btn
            .setButtonText("Use this account for Headless Sync")
            .setCta()
            .onClick(async () => {
              try {
                await auth.sendTokenToServer(localToken);
                new Notice("Connected to Headless Sync");
                const status = await api.getStatus();
                this.renderAuthSection(status);
                await this.renderSyncSection(status.authenticated);
              } catch (e) {
                new Notice(`Failed to connect: ${e.message}`);
              }
            });
        });
    } else {
      new Setting(this._authEl)
        .setName("Obsidian Sync account")
        .setDesc("Sign in to your Obsidian account to enable sync.")
        .addButton((btn) => {
          btn.setButtonText("Log in to Obsidian Sync").onClick(() => {
            const triggered = auth.triggerLogin(this.app);

            if (!triggered) {
              new Notice(
                "Could not open login dialog. Try logging in from Settings > General.",
              );
              return;
            }

            this._cancelWait = auth.waitForLogin(async (token) => {
              this._cancelWait = null;

              if (token) {
                new Notice(`Detected login: ${token.name}`);
                const status = await api.getStatus();
                this.renderAuthSection(status);
                await this.renderSyncSection(status.authenticated);
              }
            });
          });
        });
    }
  }

  async renderSyncSection(authenticated) {
    this._syncEl.empty();

    this._syncEl.createEl("h3", { text: "Vault sync" });

    if (!authenticated) {
      new Setting(this._syncEl)
        .setName("Sync not configured")
        .setDesc("Sign in to your Obsidian Sync account to set up sync.")
        .addButton((btn) => {
          btn.setButtonText("Set up sync");
          btn.buttonEl.disabled = true;
        });

      return;
    }

    const vaultId = this.app.vault.getName();

    let vaultsData;

    try {
      vaultsData = await api.getVaults();
    } catch (e) {
      this._syncEl.createEl("p", {
        text: `Failed to load sync state: ${e.message}`,
        cls: "mod-warning",
      });
      return;
    }

    const vaultState = vaultsData.vaults.find((v) => v.vaultId === vaultId);

    if (!vaultState) {
      new Setting(this._syncEl)
        .setName("Sync not configured")
        .setDesc("This vault has not been linked to a remote vault yet.")
        .addButton((btn) => {
          btn
            .setButtonText("Set up sync")
            .setCta()
            .onClick(() => {
              const scope = this.app.setting.scope;
              const prevFocusContainer = scope.tabFocusContainerEl;
              scope.tabFocusContainerEl = null;

              const cleanup = () => {
                scope.tabFocusContainerEl = prevFocusContainer;
              };

              const modal = new window.IgnisUI.SyncSetupModal({
                target: document.body,
                props: {
                  vaultId,
                  onSuccess: async () => {
                    cleanup();
                    modal.$destroy();
                    await this.renderSyncSection(true);
                  },
                },
              });

              modal.$on("close", () => {
                cleanup();
                modal.$destroy();
              });
            });
        });

      return;
    }

    // Show current sync config
    new Setting(this._syncEl)
      .setName("Remote vault")
      .setDesc(
        vaultState.remoteVaultName || vaultState.remoteVault || "unknown",
      )
      .addButton((btn) => {
        btn.setButtonText("Unlink");
        btn.buttonEl.addClass("mod-destructive");
        btn.onClick(async () => {
          try {
            await api.unlinkVault(vaultId);
            new Notice("Vault unlinked");
            await this.renderSyncSection(true);
          } catch (e) {
            new Notice(`Failed to unlink: ${e.message}`);
          }
        });
      });

    new Setting(this._syncEl)
      .setName("Sync mode")
      .setDesc(vaultState.config?.mode || "bidirectional");

    // Sync controls
    const controlsEl = this._syncEl.createDiv();
    this.renderSyncControls(controlsEl, vaultId, vaultState);

    // Log viewer - only render once, persists across sync section rebuilds
    if (!this._logsRendered) {
      await this.renderLogs(this._logsEl, vaultId);
      this._logsRendered = true;
    }
  }

  async renderSyncControls(containerEl, vaultId, vaultState) {
    containerEl.empty();

    if (!vaultState) {
      try {
        const data = await api.getVaults();
        vaultState = (data.vaults || []).find((v) => v.vaultId === vaultId);
      } catch {
        return;
      }
    }

    if (!vaultState) {
      return;
    }

    const statusText =
      vaultState.status === "running"
        ? "Sync is running"
        : vaultState.status === "error"
          ? `Error: ${vaultState.error}`
          : "Sync is stopped";

    new Setting(containerEl)
      .setName("Status")
      .setDesc(statusText)
      .addButton((btn) => {
        if (vaultState.status === "running") {
          btn.setButtonText("Stop sync");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api.stopSync(vaultId);
              new Notice("Sync stopped");
              this.renderSyncControls(containerEl, vaultId);
            } catch (e) {
              new Notice(`Failed to stop: ${e.message}`);
            }
          });
        } else {
          btn
            .setButtonText("Start sync")
            .setCta()
            .onClick(async () => {
              try {
                await api.startSync(vaultId);
                new Notice("Sync started");
                this.renderSyncControls(containerEl, vaultId);
              } catch (e) {
                new Notice(`Failed to start: ${e.message}`);
              }
            });
        }
      });
  }

  async renderLogs(containerEl, vaultId) {
    this._logCleanup = await renderLogViewer(containerEl, vaultId);
  }

  hide() {
    if (this._cancelWait) {
      this._cancelWait();
      this._cancelWait = null;
    }

    if (this._logCleanup) {
      this._logCleanup();
      this._logCleanup = null;
    }

    super.hide();
  }
}

module.exports = { HeadlessSyncSettingTab };

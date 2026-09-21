const { PluginSettingTab, Setting, Notice } = require("obsidian");
const api = require("./api");
const { isCoreSyncEnabled } = require("./core-sync-guard");
const { SyncLogModal } = require("./sync-log-modal");
const { renderAuthSection } = require("./auth-section");
const {
  SYNC_MODES,
  FILE_TYPES,
  CONFIG_CATEGORIES,
  keysOf,
} = require("../../sync-options");

function toggleKey(options, selected, key, enabled) {
  const keys = new Set(selected);

  if (enabled) {
    keys.add(key);
  } else {
    keys.delete(key);
  }

  return options
    .filter((option) => keys.has(option.key))
    .map((option) => option.key);
}

function createSettingGroup(containerEl, heading) {
  const group = containerEl.createDiv("setting-group");

  if (heading) {
    new Setting(group).setName(heading).setHeading();
  }

  return group.createDiv("setting-items");
}

function readSyncConfig(vaultState) {
  return {
    mode: vaultState.config?.mode || "bidirectional",
    fileTypes: vaultState.config?.fileTypes || keysOf(FILE_TYPES),
    configs: vaultState.config?.configs || keysOf(CONFIG_CATEGORIES),
    excludedFolders: vaultState.config?.excludedFolders || [],
  };
}

function describeExcludedFolders(count) {
  if (count === 0) {
    return "No folders excluded";
  }

  return count === 1 ? "1 folder excluded" : `${count} folders excluded`;
}

function describeSyncStatus(vaultState) {
  if (vaultState.status === "running") {
    return "Sync is running";
  }

  if (vaultState.status === "error") {
    return `Error: ${vaultState.error}`;
  }

  return "Sync is stopped";
}

class HeadlessSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this._cancelWait = null;

    // Persistent container refs
    this._authEl = null;
    this._syncEl = null;
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();

    if (isCoreSyncEnabled()) {
      const syncWarningSetting = new Setting(containerEl).setName(
        "Obsidian Sync is active",
      );

      syncWarningSetting.descEl.createEl("span", {
        text: "Headless Sync cannot run alongside Obsidian's built-in sync to avoid conflicts. Disable Obsidian Sync in Core Plugins to use Headless Sync instead.",
        cls: "mod-warning",
      });

      syncWarningSetting.addButton((btn) => {
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

    renderAuthSection(this, serverStatus);
    await this.renderSyncSection(serverStatus.authenticated);
  }

  async renderSyncSection(authenticated) {
    const scrollEl = this._syncEl.closest(".vertical-tab-content");
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;

    await this.renderSyncContent(authenticated);

    if (scrollEl) {
      scrollEl.scrollTop = scrollTop;
    }
  }

  async renderSyncContent(authenticated) {
    if (!authenticated) {
      this._syncEl.empty();

      const items = createSettingGroup(this._syncEl, "Vault sync");

      new Setting(items)
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
      this._syncEl.empty();
      this._syncEl.createEl("p", {
        text: `Failed to load sync state: ${e.message}`,
        cls: "mod-warning",
      });
      return;
    }

    this._syncEl.empty();

    const vaultState = vaultsData.vaults.find((v) => v.vaultId === vaultId);

    if (!vaultState) {
      this.renderSyncSetup(vaultId);
      return;
    }

    const syncConfig = readSyncConfig(vaultState);

    const saveSyncConfig = async () => {
      try {
        const { restarted } = await api.setConfig(vaultId, syncConfig);

        new Notice(
          restarted
            ? "Sync settings saved, sync restarted"
            : "Sync settings saved",
        );
      } catch (e) {
        new Notice(`Failed to save sync settings: ${e.message}`);
      }
    };

    this.renderVaultSyncGroup(vaultId, vaultState, syncConfig, saveSyncConfig);
    this.renderSelectiveSyncGroup(syncConfig, saveSyncConfig);
    this.renderConfigSyncGroup(syncConfig, saveSyncConfig);
  }

  renderSyncSetup(vaultId) {
    const items = createSettingGroup(this._syncEl, "Vault sync");

    new Setting(items)
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
  }

  renderVaultSyncGroup(vaultId, vaultState, syncConfig, saveSyncConfig) {
    const items = createSettingGroup(this._syncEl, "Vault sync");

    new Setting(items)
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

    new Setting(items)
      .setName("Sync status")
      .setDesc(describeSyncStatus(vaultState))
      .addButton((btn) => {
        if (vaultState.status === "running") {
          btn.setButtonText("Stop sync");
          btn.buttonEl.addClass("mod-destructive");
          btn.onClick(async () => {
            try {
              await api.stopSync(vaultId);
              new Notice("Sync stopped");
              await this.renderSyncSection(true);
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
                await this.renderSyncSection(true);
              } catch (e) {
                new Notice(`Failed to start: ${e.message}`);
              }
            });
        }
      });

    new Setting(items).setName("Sync mode").addDropdown((dropdown) => {
      for (const syncMode of SYNC_MODES) {
        dropdown.addOption(syncMode.key, syncMode.name);
      }

      dropdown.setValue(syncConfig.mode).onChange(async (mode) => {
        syncConfig.mode = mode;
        await saveSyncConfig();
        await this.renderSyncSection(true);
      });
    });

    new Setting(items)
      .setName("Sync log")
      .setDesc("View recent sync activity.")
      .addButton((btn) => {
        btn.setButtonText("View").onClick(() => {
          new SyncLogModal(this.app, vaultId).open();
        });
      });
  }

  renderSelectiveSyncGroup(syncConfig, saveSyncConfig) {
    const items = createSettingGroup(this._syncEl, "Selective sync");

    new Setting(items)
      .setName("Excluded folders")
      .setDesc(describeExcludedFolders(syncConfig.excludedFolders.length))
      .addButton((btn) => {
        btn.setButtonText("Manage").onClick(() => {
          this.openExcludedFoldersEditor(syncConfig, saveSyncConfig);
        });
      });

    for (const fileType of FILE_TYPES) {
      new Setting(items)
        .setName(fileType.name)
        .setDesc(fileType.desc)
        .addToggle((toggle) => {
          toggle
            .setValue(syncConfig.fileTypes.includes(fileType.key))
            .onChange(async (enabled) => {
              syncConfig.fileTypes = toggleKey(
                FILE_TYPES,
                syncConfig.fileTypes,
                fileType.key,
                enabled,
              );
              await saveSyncConfig();
              await this.renderSyncSection(true);
            });
        });
    }
  }

  renderConfigSyncGroup(syncConfig, saveSyncConfig) {
    const items = createSettingGroup(this._syncEl, "Vault configuration sync");

    for (const category of CONFIG_CATEGORIES) {
      new Setting(items)
        .setName(category.name)
        .setDesc(category.desc)
        .addToggle((toggle) => {
          toggle
            .setValue(syncConfig.configs.includes(category.key))
            .onChange(async (enabled) => {
              syncConfig.configs = toggleKey(
                CONFIG_CATEGORIES,
                syncConfig.configs,
                category.key,
                enabled,
              );
              await saveSyncConfig();
              await this.renderSyncSection(true);
            });
        });
    }
  }

  openExcludedFoldersEditor(syncConfig, saveSyncConfig) {
    const folders = this.app.vault
      .getAllFolders()
      .map((folder) => folder.path)
      .filter((path) => path && path !== "/");

    const component = new window.IgnisUI.ExcludedFoldersEditor({
      target: document.querySelector(".modal-container") || document.body,
      props: {
        folders,
        excluded: syncConfig.excludedFolders,
      },
    });

    let latest = syncConfig.excludedFolders;
    let dirty = false;

    component.$on("change", (event) => {
      latest = event.detail;
      dirty = true;
    });

    component.$on("close", async () => {
      component.$destroy();

      if (!dirty) {
        return;
      }

      syncConfig.excludedFolders = latest;
      await saveSyncConfig();
      await this.renderSyncSection(true);
    });
  }

  hide() {
    if (this._cancelWait) {
      this._cancelWait();
      this._cancelWait = null;
    }

    super.hide();
  }
}

module.exports = { HeadlessSyncSettingTab };

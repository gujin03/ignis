import { Setting } from "obsidian";
import { vaultService } from "@ignis/services";
import { createSettingGroup, saveSetting } from "./settings-ui.js";
import { isDemoMode } from "../demo-guards.js";

function display(containerEl) {
  containerEl.createEl("h2", { text: "Vault" });

  containerEl.createEl("p", {
    text:
      "Settings for the currently active vault. " +
      "These settings are not stored in the vault itself, unlike Obsidian's native settings; they apply to all browsers and devices that open this vault.",
    cls: "ignis-tab-description",
  });

  if (isDemoMode()) {
    const items = createSettingGroup(containerEl);

    new Setting(items)
      .setName("Vault settings")
      .setDesc("Vault settings are disabled in demo mode.");
    return;
  }

  const loading = containerEl.createEl("p", {
    text: "Loading server settings...",
    cls: "setting-item-description",
  });

  fetch("/api/settings")
    .then((res) => (res.ok ? res.json() : Promise.reject(res)))
    .then((current) => {
      loading.remove();
      addTrustSetting(containerEl, current.trustedVaults || []);
    })
    .catch(() => {
      loading.setText("Failed to load server settings.");
    });
}

function addTrustSetting(containerEl, trustedVaults) {
  const items = createSettingGroup(containerEl);
  const vaultId = vaultService.getCurrentVaultId();

  new Setting(items)
    .setName("Always trust plugins for this vault")
    .setDesc(
      "Enable community plugins for this vault in every browser that opens it, so the restricted-mode prompt does not appear on a new device or after clearing site data.",
    )
    .addToggle((toggle) => {
      toggle.setValue(trustedVaults.includes(vaultId));

      toggle.onChange(async (value) => {
        if (value === trustedVaults.includes(vaultId)) {
          return;
        }

        const saved = await saveSetting({
          trustedVaults: value
            ? [...trustedVaults, vaultId]
            : trustedVaults.filter((id) => id !== vaultId),
        });

        if (!saved) {
          toggle.setValue(!value);
          return;
        }

        trustedVaults = saved.trustedVaults;

        if (value) {
          vaultService.setVaultTrust(vaultId);
        }
      });
    });
}

export { display };

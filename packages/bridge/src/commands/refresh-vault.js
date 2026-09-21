import { Notice } from "obsidian";
import { vaultService } from "@ignis/services";

function registerRefreshVault(plugin) {
  plugin.addCommand({
    id: "refresh-vault-from-disk",
    name: "Refresh vault from disk",
    callback: async () => {
      try {
        const result = await vaultService.refreshVault(
          vaultService.getCurrentVaultId(),
        );

        new Notice(
          result.drifted ? "Vault refreshed" : "Vault already up to date",
        );
      } catch (e) {
        new Notice(`Refresh failed: ${e.message}`);
      }
    },
  });
}

export { registerRefreshVault };

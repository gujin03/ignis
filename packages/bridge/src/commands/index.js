import { registerOpenWorkspace } from "./open-workspace.js";
import { registerRefreshVault } from "./refresh-vault.js";

function registerCommands(plugin) {
  registerOpenWorkspace(plugin);
  registerRefreshVault(plugin);
}

export { registerCommands };

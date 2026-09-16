const fs = require("fs");
const path = require("path");

const BRIDGE_PLUGIN_ID = "ignis-bridge";

// Old vaults still have bridge in .obsidian/plugins from before it became virtual.
async function migratePluginFromVault(vaultPath, vaultName, pluginId) {
  let didWork = false;

  const pluginDir = path.join(vaultPath, ".obsidian", "plugins", pluginId);

  if (await fs.promises.stat(pluginDir).catch(() => null)) {
    await fs.promises.rm(pluginDir, { recursive: true, force: true });
    didWork = true;
  }

  const cpFile = path.join(vaultPath, ".obsidian", "community-plugins.json");

  try {
    const list = JSON.parse(await fs.promises.readFile(cpFile, "utf-8"));

    if (Array.isArray(list)) {
      const filtered = list.filter((id) => id !== pluginId);

      if (filtered.length !== list.length) {
        await fs.promises.writeFile(cpFile, JSON.stringify(filtered));
        didWork = true;
      }
    }
  } catch {}

  if (didWork) {
    console.log(`[ignis] Migrated ${pluginId} out of vault: ${vaultName}`);
  }

  return didWork;
}

async function migratePluginsFromAllVaults(vaultRoot, pluginIds) {
  if (!(await fs.promises.stat(vaultRoot).catch(() => null))) {
    return;
  }

  const entries = await fs.promises.readdir(vaultRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const vaultPath = path.join(vaultRoot, entry.name);

    for (const pluginId of pluginIds) {
      await migratePluginFromVault(vaultPath, entry.name, pluginId);
    }
  }
}

module.exports = {
  BRIDGE_PLUGIN_ID,
  migratePluginsFromAllVaults,
};

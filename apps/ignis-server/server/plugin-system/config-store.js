const fs = require("fs");
const path = require("path");

async function load(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function save(filePath, data) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
}

function getEnabledVaults(config, pluginId) {
  return config[pluginId]?.enabledVaults || [];
}

function setEnabledVaults(config, pluginId, vaultIds) {
  if (!config[pluginId]) {
    config[pluginId] = {};
  }

  config[pluginId].enabledVaults = vaultIds;
}

module.exports = { load, save, getEnabledVaults, setEnabledVaults };

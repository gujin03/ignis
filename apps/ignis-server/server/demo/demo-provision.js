// Vault provisioning for demo sessions.
//
// Copies the template into a session-prefixed dir and registers the vault on the session.
// Re-provisions if disk was wiped under an existing session.

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const config = require("../config");
const bootstrapRoutes = require("../routes/bootstrap");

const { sessions, makeStorageName } = require("./demo-sessions");

const DEFAULT_VAULT_NAME = "Welcome";

async function dirSize(dir) {
  let total = 0;

  async function walk(d) {
    let entries;

    try {
      entries = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      const full = path.join(d, e.name);

      if (e.isDirectory()) {
        await walk(full);
      } else {
        try {
          const st = await fsp.stat(full);
          total += st.size;
        } catch {}
      }
    }
  }

  await walk(dir);
  return total;
}

async function recomputeBytes(sessionId) {
  const s = sessions.get(sessionId);

  if (!s) {
    return 0;
  }

  let total = 0;

  for (const userVaultName of s.vaults) {
    const storageName = makeStorageName(sessionId, userVaultName);
    const vaultPath = config.getVaultPath(storageName);

    if (vaultPath) {
      total += await dirSize(vaultPath);
    }
  }

  s.bytesUsed = total;
  return total;
}

async function provisionVault(sessionId, userVaultName) {
  const s = sessions.get(sessionId);

  if (!s) {
    return null;
  }

  if (s.vaults.size >= config.demoVaultsPerSession) {
    return { error: "vaults-per-session-limit" };
  }

  const storageName = makeStorageName(sessionId, userVaultName);
  const vaultPath = path.join(config.vaultRoot, storageName);

  // keep the resolved path inside the vault root.
  const root = path.resolve(config.vaultRoot);
  const resolved = path.resolve(vaultPath);

  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return { error: "invalid-vault-name" };
  }

  await fsp.mkdir(config.vaultRoot, { recursive: true });

  try {
    await fsp.mkdir(vaultPath, { recursive: false });
  } catch (e) {
    if (e.code === "EEXIST") {
      return { error: "vault-exists" };
    }

    throw e;
  }

  // Copy template (default: Welcome.md, Getting Started.md, .obsidian/*).
  await fsp.cp(config.demoTemplateDir, vaultPath, { recursive: true });

  config.refreshVaults();
  bootstrapRoutes.invalidateVault(storageName);

  s.vaults.add(userVaultName);
  await recomputeBytes(sessionId);

  return { storageName, userVaultName };
}

async function ensureDefaultVault(sessionId) {
  const s = sessions.get(sessionId);

  if (!s) {
    return null;
  }

  const storageName = makeStorageName(sessionId, DEFAULT_VAULT_NAME);
  const vaultPath = config.getVaultPath(storageName);
  const onDisk = vaultPath && fs.existsSync(vaultPath);

  if (s.vaults.has(DEFAULT_VAULT_NAME) && onDisk) {
    return DEFAULT_VAULT_NAME;
  }

  if (onDisk) {
    // Disk has it but session forgot (cookie outlived in-memory session).
    s.vaults.add(DEFAULT_VAULT_NAME);
    return DEFAULT_VAULT_NAME;
  }

  // Disk wiped under us; clear stale Set entry before re-provisioning.
  s.vaults.delete(DEFAULT_VAULT_NAME);

  const result = await provisionVault(sessionId, DEFAULT_VAULT_NAME);

  if (result && result.userVaultName) {
    return result.userVaultName;
  }

  return null;
}

module.exports = {
  DEFAULT_VAULT_NAME,
  provisionVault,
  ensureDefaultVault,
  recomputeBytes,
};

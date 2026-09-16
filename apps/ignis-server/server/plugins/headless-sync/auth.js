const fs = require("fs");
const path = require("path");
const { getObHome } = require("./ob-cli");

function getObAuthFile(dataDir) {
  return path.join(
    getObHome(dataDir),
    ".config",
    "obsidian-headless",
    "auth_token",
  );
}

function getInternalTokenFile(dataDir) {
  return path.join(dataDir, "auth-token.json");
}

function loadToken(dataDir) {
  const internalFile = getInternalTokenFile(dataDir);

  try {
    if (fs.existsSync(internalFile)) {
      const data = JSON.parse(fs.readFileSync(internalFile, "utf-8"));

      if (data && data.token) {
        syncToObCli(dataDir, data.token);
        return data;
      }
    }
  } catch {}

  // Fall back to ob CLI's own auth file
  const obAuthFile = getObAuthFile(dataDir);

  try {
    if (fs.existsSync(obAuthFile)) {
      const token = fs.readFileSync(obAuthFile, "utf-8").trim();

      if (token) {
        const data = { token };
        saveInternal(dataDir, data);
        return data;
      }
    }
  } catch {}

  return null;
}

function saveToken(dataDir, tokenData) {
  saveInternal(dataDir, tokenData);
  syncToObCli(dataDir, tokenData.token);
}

function clearToken(dataDir) {
  const internalFile = getInternalTokenFile(dataDir);

  try {
    if (fs.existsSync(internalFile)) {
      fs.unlinkSync(internalFile);
    }
  } catch {}

  const obAuthFile = getObAuthFile(dataDir);

  try {
    if (fs.existsSync(obAuthFile)) {
      fs.unlinkSync(obAuthFile);
    }
  } catch {}
}

function isAuthenticated(dataDir) {
  const internalFile = getInternalTokenFile(dataDir);

  try {
    if (fs.existsSync(internalFile)) {
      const data = JSON.parse(fs.readFileSync(internalFile, "utf-8"));
      return !!(data && data.token);
    }
  } catch {}

  return false;
}

function writeSecret(file, contents) {
  fs.writeFileSync(file, contents, { encoding: "utf-8", mode: 0o600 });

  try {
    fs.chmodSync(file, 0o600);
  } catch {}
}

function saveInternal(dataDir, tokenData) {
  const internalFile = getInternalTokenFile(dataDir);
  const dir = path.dirname(internalFile);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  writeSecret(internalFile, JSON.stringify(tokenData, null, 2));
}

function syncToObCli(dataDir, token) {
  const obAuthFile = getObAuthFile(dataDir);

  try {
    const dir = path.dirname(obAuthFile);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    writeSecret(obAuthFile, token);
  } catch {}
}

function getTokenInfo(dataDir) {
  const internalFile = getInternalTokenFile(dataDir);

  try {
    if (fs.existsSync(internalFile)) {
      const data = JSON.parse(fs.readFileSync(internalFile, "utf-8"));

      if (data && data.token) {
        return { email: data.email || null, name: data.name || null };
      }
    }
  } catch {}

  return null;
}

module.exports = {
  loadToken,
  saveToken,
  clearToken,
  isAuthenticated,
  getTokenInfo,
};

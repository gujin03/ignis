const { spawn, execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// When set via configure(), HOME for the spawned ob points under the plugin's data dir so
// ob's config dir (~/.config/obsidian-headless/) survives container recreates.
let configuredDataDir = null;

function getObHome(dataDir) {
  return path.join(dataDir, "ob-home");
}

function configure(opts) {
  configuredDataDir = opts && opts.dataDir ? opts.dataDir : null;

  if (configuredDataDir) {
    try {
      fs.mkdirSync(getObHome(configuredDataDir), { recursive: true });
    } catch {}
  }
}

function checkInstalled() {
  try {
    const output = execSync("ob --version", {
      stdio: "pipe",
      windowsHide: true,
    })
      .toString()
      .trim();

    return { installed: true, version: output || "unknown" };
  } catch {
    return { installed: false, version: null };
  }
}

function spawnOb(args, opts = {}) {
  const home = configuredDataDir ? getObHome(configuredDataDir) : os.homedir();

  return spawn("ob", args, {
    env: { ...process.env, HOME: home },
    shell: false,
    windowsHide: true,
    ...opts,
  });
}

function runCommand(args, opts = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawnOb(args, opts);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(`ob ${args[0]} failed (code ${code}): ${stderr || stdout}`),
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

module.exports = {
  checkInstalled,
  spawnOb,
  runCommand,
  configure,
  getObHome,
};

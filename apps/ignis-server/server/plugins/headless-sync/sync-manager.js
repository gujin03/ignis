const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { spawnOb, runCommand } = require("../../obsidian-account/ob-cli");
const {
  SYNC_MODES,
  FILE_TYPES,
  CONFIG_CATEGORIES,
  keysOf,
} = require("./sync-options");

const MAX_LOG_ENTRIES = 2000;
const MAX_LOG_LINE = 4096;
const IDLE_CHECK_DIVISOR = 4;
const MIN_IDLE_CHECK_MS = 1000;
const PROCESS_EXIT_WAIT_MS = 5000;

const SYNC_MODE_KEYS = keysOf(SYNC_MODES);
const FILE_TYPE_KEYS = keysOf(FILE_TYPES);
const CONFIG_CATEGORY_KEYS = keysOf(CONFIG_CATEGORIES);

function invalidConfigReason(config) {
  if (!Array.isArray(config.fileTypes)) {
    return "fileTypes must be an array";
  }

  if (!Array.isArray(config.configs)) {
    return "configs must be an array";
  }

  if (!Array.isArray(config.excludedFolders)) {
    return "excludedFolders must be an array";
  }

  for (const fileType of config.fileTypes) {
    if (!FILE_TYPE_KEYS.includes(fileType)) {
      return `Unknown file type: ${fileType}`;
    }
  }

  for (const category of config.configs) {
    if (!CONFIG_CATEGORY_KEYS.includes(category)) {
      return `Unknown config category: ${category}`;
    }
  }

  if (!SYNC_MODE_KEYS.includes(config.mode)) {
    return `Unknown sync mode: ${config.mode}`;
  }

  return null;
}

function persistedConfig(state) {
  if (!state._needsConfigApply) {
    return state.config;
  }

  return {
    mode: state.config.mode,
    deviceName: state.config.deviceName,
  };
}

function waitForClose(proc, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);

    proc.once("close", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function removeSyncLock(vaultPath) {
  fs.rmSync(path.join(vaultPath, ".obsidian", ".sync.lock"), {
    recursive: true,
    force: true,
  });
}

function killProcess(proc, signal) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(proc.pid), "/t", "/f"]);
  } else {
    proc.kill(signal);
  }
}

class SyncManager {
  constructor(ctx, broadcaster) {
    this.ctx = ctx;
    this.broadcaster = broadcaster;
    this.states = new Map();
    this.stateFile = path.join(ctx.dataDir, "sync-states.json");
    this.idleRestartMs = ctx.config.headlessSyncIdleRestartMs || 0;
  }

  loadStates(vaults) {
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, "utf-8"));

      for (const entry of saved) {
        const vaultPath = vaults[entry.vaultId];

        if (!vaultPath) {
          this.ctx.log(`Skipping state for missing vault: ${entry.vaultId}`);
          continue;
        }

        const savedConfig = entry.config || {};

        this.states.set(entry.vaultId, {
          vaultId: entry.vaultId,
          vaultPath,
          remoteVault: entry.remoteVault,
          remoteVaultName: entry.remoteVaultName || null,
          status: "stopped",
          pid: null,
          lastActivity: new Date().toISOString(),
          error: null,
          config: {
            mode: savedConfig.mode || "bidirectional",
            deviceName: savedConfig.deviceName || "ignis-headless",
            fileTypes: savedConfig.fileTypes || [...FILE_TYPE_KEYS],
            configs: savedConfig.configs || [...CONFIG_CATEGORY_KEYS],
            excludedFolders: savedConfig.excludedFolders || [],
          },
          autoStart: entry.autoStart || false,
          logs: [],
          _process: null,
          _needsConfigApply: !savedConfig.fileTypes,
        });
      }

      this.ctx.log(`Loaded ${saved.length} sync configurations`);
    } catch {
      this.ctx.log("No previous sync states found");
    }
  }

  saveStates() {
    const data = [];

    for (const state of this.states.values()) {
      data.push({
        vaultId: state.vaultId,
        vaultPath: state.vaultPath,
        remoteVault: state.remoteVault,
        remoteVaultName: state.remoteVaultName,
        config: persistedConfig(state),
        autoStart: state.autoStart,
      });
    }

    fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2), "utf-8");
  }

  async createRemoteVault(name, options = {}) {
    const args = ["sync-create-remote", "--name", name];

    if (options.encryption) {
      args.push("--encryption", options.encryption);
    }

    if (options.region) {
      args.push("--region", options.region);
    }

    // pass password with stdin
    await runCommand(args, {
      input: options.password ? `${options.password}\n` : "",
    });
  }

  async setupSync(vaultId, vaultPath, remoteVault, options = {}) {
    const args = ["sync-setup", "--vault", remoteVault, "--path", "."];

    if (options.deviceName) {
      args.push("--device-name", options.deviceName);
    }

    await runCommand(args, {
      cwd: vaultPath,
      input: options.vaultPassword ? `${options.vaultPassword}\n` : "",
    });

    const state = {
      vaultId,
      vaultPath,
      remoteVault,
      remoteVaultName: options.remoteVaultName || null,
      status: "stopped",
      pid: null,
      lastActivity: new Date().toISOString(),
      error: null,
      config: {
        mode: options.mode || "bidirectional",
        deviceName: options.deviceName || "ignis-headless",
        fileTypes: [...FILE_TYPE_KEYS],
        configs: [...CONFIG_CATEGORY_KEYS],
        excludedFolders: [],
      },
      autoStart: false,
      logs: [],
      _process: null,
      _needsConfigApply: true,
    };

    this.states.set(vaultId, state);

    try {
      await this.applySyncConfig(vaultId, state.config);
      state._needsConfigApply = false;
    } catch (e) {
      this.ctx.log(`Failed to apply sync config for ${vaultId}: ${e.message}`);
    }

    this.saveStates();
    this.ctx.log(`Sync setup complete for ${vaultId} -> ${remoteVault}`);

    return this.getState(vaultId);
  }

  async applySyncConfig(vaultId, config) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No sync configuration for vault: ${vaultId}`);
    }

    await runCommand(
      [
        "sync-config",
        "--path",
        ".",
        "--file-types",
        config.fileTypes.join(","),
        "--configs",
        config.configs.join(","),
        "--excluded-folders",
        config.excludedFolders.join(","),
        "--mode",
        config.mode,
      ],
      { cwd: state.vaultPath },
    );
  }

  async applyPendingConfigs() {
    let pendingVaults = 0;

    for (const [vaultId, state] of this.states) {
      if (!state._needsConfigApply) {
        continue;
      }

      pendingVaults++;

      try {
        await this.applySyncConfig(vaultId, state.config);
        state._needsConfigApply = false;
      } catch (e) {
        this.ctx.log(
          `Failed to apply sync config for ${vaultId}: ${e.message}`,
        );
      }
    }

    if (pendingVaults > 0) {
      this.saveStates();
    }
  }

  async configureSync(vaultId, config) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No sync configuration for vault: ${vaultId}`);
    }

    const reason = invalidConfigReason(config);

    if (reason) {
      throw new Error(reason);
    }

    const nextConfig = {
      ...state.config,
      mode: config.mode,
      fileTypes: [...config.fileTypes],
      configs: [...config.configs],
      excludedFolders: [...config.excludedFolders],
    };

    await this.applySyncConfig(vaultId, nextConfig);

    state.config = nextConfig;
    state._needsConfigApply = false;

    const restarted = state.status === "running";

    if (restarted) {
      this.addLog(state, "Restarting sync to pick up the new configuration");
      await this.stopProcess(state);
      this.spawnProcess(state);
      this.broadcaster.broadcastStatus(this.getState(vaultId));
      this.ctx.log(`Restarted sync for ${vaultId} (pid: ${state.pid})`);
    }

    this.saveStates();

    return { state: this.getState(vaultId), restarted };
  }

  async startSync(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No sync configuration for vault: ${vaultId}`);
    }

    if (state.status === "running") {
      this.ctx.log(`Taking over sync for ${vaultId} (pid: ${state.pid})`);
      this.addLog(state, `Replacing sync process ${state.pid}`);
      await this.stopProcess(state);
    }

    this.spawnProcess(state);

    this.broadcaster.broadcastStatus(this.getState(vaultId));
    this.ctx.log(`Started sync for ${vaultId} (pid: ${state.pid})`);
    this.saveStates();

    return this.getState(vaultId);
  }

  spawnProcess(state) {
    const vaultId = state.vaultId;
    const proc = spawnOb(["sync", "--continuous"], { cwd: state.vaultPath });

    state.status = "running";
    state.pid = proc.pid;
    state.error = null;
    state.autoStart = true;
    state._process = proc;
    state.lastActivity = new Date().toISOString();
    state._userStopped = false;

    this.addLog(state, `Sync started (pid: ${proc.pid})`);
    this.startIdleRestartTimer(state);

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed) {
          const capped = trimmed.slice(0, MAX_LOG_LINE);
          this.addLog(state, capped);
          state.lastActivity = new Date().toISOString();
          this.broadcaster.broadcastLog(vaultId, capped);
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");

      for (const line of lines) {
        if (line.trim()) {
          this.addLog(state, `[stderr] ${line.trim()}`);
        }
      }
    });

    proc.on("close", (code) => {
      if (state._process !== proc) {
        return;
      }

      this.clearIdleRestartTimer(state);

      // Don't overwrite "stopped" state if the user explicitly stopped sync
      if (state._userStopped) {
        state._userStopped = false;
        return;
      }

      state.status = code === 0 ? "stopped" : "error";
      state.pid = null;
      state._process = null;

      if (code !== 0) {
        state.error = `Process exited with code ${code}`;
        this.addLog(state, `Sync exited with code ${code}`);
      } else {
        this.addLog(state, "Sync stopped");
      }

      this.ctx.log(`Sync stopped for ${vaultId} (code: ${code})`);
      this.broadcaster.broadcastStatus(this.getState(vaultId));
      this.saveStates();
    });

    proc.on("error", (err) => {
      if (state._process !== proc) {
        return;
      }

      this.clearIdleRestartTimer(state);

      state.status = "error";
      state.error = err.message;
      state.pid = null;
      state._process = null;

      this.addLog(state, `Error: ${err.message}`);
      this.ctx.log(`Sync error for ${vaultId}: ${err.message}`);
      this.broadcaster.broadcastStatus(this.getState(vaultId));
      this.saveStates();
    });
  }

  async stopProcess(state) {
    this.clearIdleRestartTimer(state);

    const proc = state._process;

    state._process = null;

    if (!proc) {
      return;
    }

    let closed = waitForClose(proc, PROCESS_EXIT_WAIT_MS);

    killProcess(proc, "SIGTERM");

    if (!(await closed)) {
      closed = waitForClose(proc, PROCESS_EXIT_WAIT_MS);
      killProcess(proc, "SIGKILL");
      await closed;
    }

    removeSyncLock(state.vaultPath);
  }

  stopSync(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No active sync for vault: ${vaultId}`);
    }

    if (state._process) {
      state._userStopped = true;
    }

    this.stopProcess(state);

    state.status = "stopped";
    state.pid = null;
    state.autoStart = false;
    state.error = null;

    this.addLog(state, "Sync stopped by user");
    this.ctx.log(`Stopped sync for ${vaultId}`);
    this.broadcaster.broadcastStatus(this.getState(vaultId));
    this.saveStates();

    return this.getState(vaultId);
  }

  async unlinkVault(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      throw new Error(`No sync configuration for vault: ${vaultId}`);
    }

    this.clearIdleRestartTimer(state);

    if (state._process) {
      state._userStopped = true;
      await this.stopProcess(state);
    }

    // Tell ob to disconnect from the remote vault and clear its stored config
    try {
      await runCommand(["sync-unlink", "--path", state.vaultPath]);
      this.ctx.log(`ob sync-unlink completed for ${vaultId}`);
    } catch (e) {
      this.ctx.log(`ob sync-unlink failed for ${vaultId}: ${e.message}`);
    }

    this.states.delete(vaultId);
    this.saveStates();
    this.ctx.log(`Unlinked vault ${vaultId}`);
  }

  getState(vaultId) {
    const state = this.states.get(vaultId);

    if (!state) {
      return null;
    }

    return {
      vaultId: state.vaultId,
      remoteVault: state.remoteVault,
      remoteVaultName: state.remoteVaultName,
      status: state.status,
      pid: state.pid,
      lastActivity: state.lastActivity,
      error: state.error,
      config: state.config,
      autoStart: state.autoStart,
    };
  }

  getAllStates() {
    const result = [];

    for (const [vaultId] of this.states) {
      result.push(this.getState(vaultId));
    }

    return result;
  }

  getLogs(vaultId, limit = 100) {
    const state = this.states.get(vaultId);

    if (!state) {
      return [];
    }

    return state.logs.slice(-limit);
  }

  addLog(state, line) {
    state.logs.push({
      timestamp: new Date().toISOString(),
      line: line.slice(0, MAX_LOG_LINE),
    });

    if (state.logs.length > MAX_LOG_ENTRIES) {
      state.logs = state.logs.slice(-MAX_LOG_ENTRIES);
    }
  }

  startIdleRestartTimer(state) {
    if (this.idleRestartMs <= 0) {
      return;
    }

    const period = Math.max(
      MIN_IDLE_CHECK_MS,
      Math.floor(this.idleRestartMs / IDLE_CHECK_DIVISOR),
    );

    const timer = setInterval(async () => {
      if (!state._process) {
        return;
      }

      const idleMs = Date.now() - Date.parse(state.lastActivity);

      if (idleMs >= this.idleRestartMs) {
        this.ctx.log(
          `Restarting idle sync for ${state.vaultId} (pid: ${state.pid})`,
        );
        this.addLog(
          state,
          `No activity for ${this.idleRestartMs}ms, restarting sync (HEADLESS_SYNC_IDLE_RESTART_MS)`,
        );

        await this.stopProcess(state);
        this.spawnProcess(state);
        this.broadcaster.broadcastStatus(this.getState(state.vaultId));
      }
    }, period);

    if (timer.unref) {
      timer.unref();
    }

    state._idleRestartTimer = timer;
  }

  clearIdleRestartTimer(state) {
    if (state._idleRestartTimer) {
      clearInterval(state._idleRestartTimer);
      state._idleRestartTimer = null;
    }
  }

  autoStartAll() {
    let started = 0;

    for (const [vaultId, state] of this.states) {
      if (state.autoStart && state.status === "stopped") {
        this.startSync(vaultId).catch((e) => {
          this.ctx.log(`Auto-start failed for ${vaultId}: ${e.message}`);
        });
        started++;
      }
    }

    if (started > 0) {
      this.ctx.log(`Auto-started sync for ${started} vault(s)`);
    }
  }

  async shutdown() {
    this.ctx.log("Shutting down sync manager...");

    const waitPromises = [];

    for (const [vaultId, state] of this.states) {
      this.clearIdleRestartTimer(state);

      if (state._process) {
        this.ctx.log(`Stopping sync for ${vaultId}...`);
        state._userStopped = true;

        const proc = state._process;

        waitPromises.push(waitForClose(proc, PROCESS_EXIT_WAIT_MS));

        try {
          killProcess(proc, "SIGTERM");
        } catch (e) {
          this.ctx.log(`Error stopping sync for ${vaultId}: ${e.message}`);
        }
      }
    }

    if (waitPromises.length > 0) {
      await Promise.all(waitPromises);
    }

    this.saveStates();
  }
}

module.exports = { SyncManager, invalidConfigReason };

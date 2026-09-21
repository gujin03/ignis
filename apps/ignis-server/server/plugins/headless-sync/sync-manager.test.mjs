import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const spawned = [];
const commandRuns = [];
let nextPid = 4000;
let failingCommand = null;

const obCli = require("../../obsidian-account/ob-cli.js");

obCli.runCommand = async (args, opts) => {
  commandRuns.push({ args, opts });

  if (args[0] === failingCommand) {
    throw new Error(`ob ${args[0]} failed (code 1)`);
  }

  return { stdout: "", stderr: "" };
};

obCli.spawnOb = () => {
  const proc = new EventEmitter();

  proc.pid = nextPid++;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = () => {
    proc.killed = true;
    proc.emit("close", null);
  };

  spawned.push(proc);

  return proc;
};

const { SyncManager } = require("./sync-manager.js");

const THRESHOLD_MS = 60000;
const CHECK_MS = THRESHOLD_MS / 4;

const ALL_FILE_TYPES = "image,audio,video,pdf,unsupported";
const ALL_CONFIGS =
  "app,appearance,appearance-data,hotkey,core-plugin,core-plugin-data,community-plugin,community-plugin-data";

let dataDir;
let realPlatform;

function createManager(idleRestartMs = 0) {
  const broadcaster = { broadcastLog: vi.fn(), broadcastStatus: vi.fn() };
  const logged = [];
  const ctx = {
    dataDir,
    log: (line) => logged.push(line),
    config: { headlessSyncIdleRestartMs: idleRestartMs },
  };

  return { manager: new SyncManager(ctx, broadcaster), broadcaster, logged };
}

function configRuns() {
  return commandRuns.filter((run) => run.args[0] === "sync-config");
}

function stateFile() {
  return path.join(dataDir, "sync-states.json");
}

function writeStates(entries) {
  fs.writeFileSync(stateFile(), JSON.stringify(entries), "utf-8");
}

function readStates() {
  return JSON.parse(fs.readFileSync(stateFile(), "utf-8"));
}

async function startedManager(idleRestartMs) {
  const created = createManager(idleRestartMs);

  await created.manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");
  created.manager.startSync("v1");

  return { ...created, proc: spawned.at(-1) };
}

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-headless-sync-"));
  realPlatform = process.platform;

  // mock linux for consistency
  Object.defineProperty(process, "platform", {
    value: "linux",
    configurable: true,
  });
});

afterAll(() => {
  Object.defineProperty(process, "platform", {
    value: realPlatform,
    configurable: true,
  });

  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  spawned.length = 0;
  commandRuns.length = 0;
  failingCommand = null;
});

describe("stopSync", () => {
  it("stops a vault whose process already exited", async () => {
    const { manager, broadcaster, proc } = await startedManager();

    proc.emit("close", 1);
    expect(manager.getState("v1").status).toBe("error");

    broadcaster.broadcastStatus.mockClear();

    const state = manager.stopSync("v1");

    expect(state.status).toBe("stopped");
    expect(state.error).toBe(null);
    expect(state.pid).toBe(null);
    expect(broadcaster.broadcastStatus).toHaveBeenCalledTimes(1);
  });

  it("throws for a vault with no sync configuration", () => {
    const { manager } = createManager();

    expect(() => manager.stopSync("missing")).toThrow(/No active sync/);
  });
});

describe("stopProcess", () => {
  function lockDir(vaultPath) {
    const dir = path.join(vaultPath, ".obsidian", ".sync.lock");

    fs.mkdirSync(dir, { recursive: true });

    return dir;
  }

  it("removes the sync lock once the process has closed", async () => {
    const { manager, proc } = await startedManager();
    const state = manager.states.get("v1");
    const dir = lockDir(state.vaultPath);

    await manager.stopProcess(state);

    expect(proc.killed).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("escalates to SIGKILL when the process ignores SIGTERM", async () => {
    vi.useFakeTimers();

    try {
      const { manager, proc } = await startedManager();
      const state = manager.states.get("v1");
      const dir = lockDir(state.vaultPath);
      const signals = [];

      proc.kill = (signal) => {
        signals.push(signal);

        if (signal === "SIGKILL") {
          proc.emit("close", null);
        }
      };

      const stopped = manager.stopProcess(state);

      await vi.advanceTimersByTimeAsync(5000);
      await stopped;

      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
      expect(fs.existsSync(dir)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("startSync over a running vault", () => {
  it("kills the existing process and respawns", async () => {
    const { manager, proc: stale } = await startedManager();

    const state = await manager.startSync("v1");
    const fresh = spawned.at(-1);

    expect(fresh).not.toBe(stale);
    expect(stale.killed).toBe(true);
    expect(state.status).toBe("running");
    expect(state.pid).toBe(fresh.pid);
  });

  it("ignores the exit of the process it replaced", async () => {
    const { manager, proc: stale } = await startedManager();

    await manager.startSync("v1");

    const fresh = spawned.at(-1);

    stale.emit("close", 1);

    const state = manager.getState("v1");

    expect(state.status).toBe("running");
    expect(state.pid).toBe(fresh.pid);
    expect(state.error).toBe(null);
  });
});

describe("idle restart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leaves an idle sync alone when unset", async () => {
    const { manager, proc } = await startedManager();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(proc.killed).toBe(false);
    expect(manager.getState("v1").status).toBe("running");
  });

  it("restarts a silent sync", async () => {
    const { manager, proc } = await startedManager(THRESHOLD_MS);

    await vi.advanceTimersByTimeAsync(THRESHOLD_MS + CHECK_MS);

    const replacement = spawned.at(-1);
    const state = manager.getState("v1");

    expect(proc.killed).toBe(true);
    expect(replacement).not.toBe(proc);
    expect(state.status).toBe("running");
    expect(state.pid).toBe(replacement.pid);
    expect(state.error).toBe(null);

    await vi.advanceTimersByTimeAsync(CHECK_MS);

    expect(replacement.killed).toBe(false);
  });

  it("names the setting in the vault log when it restarts", async () => {
    const { manager } = await startedManager(THRESHOLD_MS);

    await vi.advanceTimersByTimeAsync(THRESHOLD_MS + CHECK_MS);

    const lines = manager.getLogs("v1").map((entry) => entry.line);

    expect(
      lines.some((line) => line.includes("HEADLESS_SYNC_IDLE_RESTART_MS")),
    ).toBe(true);
  });

  it("ignores the exit of the process it restarted", async () => {
    const { manager, proc } = await startedManager(THRESHOLD_MS);

    await vi.advanceTimersByTimeAsync(THRESHOLD_MS + CHECK_MS);

    const replacement = spawned.at(-1);

    proc.emit("close", null);

    const state = manager.getState("v1");

    expect(state.status).toBe("running");
    expect(state.pid).toBe(replacement.pid);
    expect(state.error).toBe(null);
  });

  it("measures a restarted sync from its own start", async () => {
    const { manager, proc } = await startedManager(THRESHOLD_MS);

    proc.stdout.emit("data", Buffer.from("Synced 1 file\n"));
    manager.stopSync("v1");

    await vi.advanceTimersByTimeAsync(THRESHOLD_MS * 5);

    manager.startSync("v1");

    const restarted = spawned.at(-1);

    await vi.advanceTimersByTimeAsync(CHECK_MS);

    expect(restarted.killed).toBe(false);
    expect(manager.getState("v1").status).toBe("running");
  });

  it("leaves a sync that keeps logging alone", async () => {
    const { manager, proc } = await startedManager(THRESHOLD_MS);

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(THRESHOLD_MS / 2);
      proc.stdout.emit("data", Buffer.from("Synced 1 file\n"));
    }

    expect(proc.killed).toBe(false);
    expect(manager.getState("v1").status).toBe("running");
  });
});

describe("createRemoteVault", () => {
  it("hands ob the E2EE password on stdin, never as an argument", async () => {
    const { manager } = createManager();

    await manager.createRemoteVault("Notes", {
      encryption: "e2ee",
      password: "hunter2",
      region: "eu",
    });

    const run = commandRuns.find((run) => run.args[0] === "sync-create-remote");

    expect(run.args).toEqual([
      "sync-create-remote",
      "--name",
      "Notes",
      "--encryption",
      "e2ee",
      "--region",
      "eu",
    ]);
    expect(run.opts.input).toBe("hunter2\n");
  });
});

describe("setupSync", () => {
  it("hands ob the E2EE password on stdin, never as an argument", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1", {
      vaultPassword: "hunter2",
    });

    const setup = commandRuns.find((run) => run.args[0] === "sync-setup");

    expect(setup.args).not.toContain("--password");
    expect(setup.args).not.toContain("hunter2");
    expect(setup.opts.input).toBe("hunter2\n");
  });

  it("closes stdin with nothing when no password is given", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    const setup = commandRuns.find((run) => run.args[0] === "sync-setup");

    expect(setup.opts.input).toBe("");
  });
});

describe("sync configuration", () => {
  const CUSTOM_CONFIG = {
    fileTypes: ["pdf", "image"],
    configs: ["core-plugin", "app"],
    excludedFolders: ["Archive", "Daily/Old"],
    mode: "pull-only",
  };

  it("pushes every file type and category to ob after setup", async () => {
    const { manager } = createManager();
    const vaultPath = path.join(dataDir, "v1");

    await manager.setupSync("v1", vaultPath, "remote1");

    expect(configRuns()).toHaveLength(1);
    expect(configRuns()[0].args).toEqual([
      "sync-config",
      "--path",
      ".",
      "--file-types",
      ALL_FILE_TYPES,
      "--configs",
      ALL_CONFIGS,
      "--excluded-folders",
      "",
      "--mode",
      "bidirectional",
    ]);
    expect(configRuns()[0].opts).toEqual({ cwd: vaultPath });
  });

  it("keeps the order a configuration was given in", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");
    await manager.configureSync("v1", CUSTOM_CONFIG);

    expect(configRuns().at(-1).args).toEqual([
      "sync-config",
      "--path",
      ".",
      "--file-types",
      "pdf,image",
      "--configs",
      "core-plugin,app",
      "--excluded-folders",
      "Archive,Daily/Old",
      "--mode",
      "pull-only",
    ]);
    expect(manager.getState("v1").config).toEqual({
      mode: "pull-only",
      deviceName: "ignis-headless",
      fileTypes: ["pdf", "image"],
      configs: ["core-plugin", "app"],
      excludedFolders: ["Archive", "Daily/Old"],
    });
  });

  it("passes an empty argument when nothing is excluded", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");
    await manager.configureSync("v1", {
      ...CUSTOM_CONFIG,
      excludedFolders: [],
    });

    const args = configRuns().at(-1).args;

    expect(args[args.indexOf("--excluded-folders") + 1]).toBe("");
  });

  it("restarts a running sync on the new configuration", async () => {
    const { manager, proc } = await startedManager();

    const { state, restarted } = await manager.configureSync(
      "v1",
      CUSTOM_CONFIG,
    );
    const replacement = spawned.at(-1);

    expect(restarted).toBe(true);
    expect(proc.killed).toBe(true);
    expect(replacement).not.toBe(proc);
    expect(state.status).toBe("running");
    expect(state.pid).toBe(replacement.pid);
    expect(state.autoStart).toBe(true);

    proc.emit("close", 1);

    expect(manager.getState("v1").status).toBe("running");
    expect(manager.getState("v1").error).toBe(null);
  });

  it("leaves a stopped sync stopped", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    const { state, restarted } = await manager.configureSync(
      "v1",
      CUSTOM_CONFIG,
    );

    expect(restarted).toBe(false);
    expect(spawned).toHaveLength(0);
    expect(state.status).toBe("stopped");
  });

  it("rejects an unknown file type", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    await expect(
      manager.configureSync("v1", { ...CUSTOM_CONFIG, fileTypes: ["exe"] }),
    ).rejects.toThrow("Unknown file type: exe");

    expect(configRuns()).toHaveLength(1);
  });

  it("rejects an unknown config category", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    await expect(
      manager.configureSync("v1", { ...CUSTOM_CONFIG, configs: ["snippets"] }),
    ).rejects.toThrow("Unknown config category: snippets");
  });

  it("rejects an unknown mode", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    await expect(
      manager.configureSync("v1", { ...CUSTOM_CONFIG, mode: "push-only" }),
    ).rejects.toThrow("Unknown sync mode: push-only");
  });

  it("changes nothing when ob rejects the configuration", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    const before = readStates();

    failingCommand = "sync-config";

    await expect(manager.configureSync("v1", CUSTOM_CONFIG)).rejects.toThrow(
      "sync-config failed",
    );

    expect(manager.getState("v1").config).toEqual(before[0].config);
    expect(readStates()).toEqual(before);
  });

  it("rejects a field that is not an array", async () => {
    const { manager } = createManager();

    await manager.setupSync("v1", path.join(dataDir, "v1"), "remote1");

    await expect(
      manager.configureSync("v1", { ...CUSTOM_CONFIG, configs: "app" }),
    ).rejects.toThrow("configs must be an array");
  });
});

describe("configuring a vault linked without one", () => {
  const LEGACY_STATE = [
    {
      vaultId: "v1",
      remoteVault: "remote1",
      remoteVaultName: "Remote One",
      config: { mode: "bidirectional", deviceName: "ignis-headless" },
      autoStart: true,
    },
  ];

  function loadedManager() {
    const created = createManager();

    created.manager.loadStates({ v1: path.join(dataDir, "v1") });

    return created;
  }

  it("pushes the defaults once and saves them", async () => {
    writeStates(LEGACY_STATE);

    const { manager } = loadedManager();

    await manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(1);
    expect(configRuns()[0].args).toContain(ALL_FILE_TYPES);
    expect(manager.getState("v1").config.fileTypes).toEqual([
      "image",
      "audio",
      "video",
      "pdf",
      "unsupported",
    ]);

    await manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(1);
    expect(readStates()[0].config.fileTypes).toHaveLength(5);

    const reloaded = loadedManager();

    await reloaded.manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(1);
  });

  it("retries on the next load until ob accepts the defaults", async () => {
    writeStates(LEGACY_STATE);
    failingCommand = "sync-config";

    const { manager } = loadedManager();

    await manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(1);
    expect(readStates()[0].config.fileTypes).toBe(undefined);
    expect(readStates()[0].config.mode).toBe("bidirectional");

    failingCommand = null;

    const retrying = loadedManager();

    await retrying.manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(2);
    expect(readStates()[0].config.fileTypes).toHaveLength(5);

    const settled = loadedManager();

    await settled.manager.applyPendingConfigs();

    expect(configRuns()).toHaveLength(2);
  });

  it("links the vault when ob rejects the configuration at setup", async () => {
    failingCommand = "sync-config";

    const { manager, logged } = createManager();
    const state = await manager.setupSync(
      "v1",
      path.join(dataDir, "v1"),
      "remote1",
    );

    expect(state.remoteVault).toBe("remote1");
    expect(state.status).toBe("stopped");
    expect(state.error).toBe(null);
    expect(
      logged.some((line) =>
        line.includes("Failed to apply sync config for v1"),
      ),
    ).toBe(true);
    expect(readStates()[0].config.fileTypes).toBe(undefined);
  });

  it("logs a failure and still starts the vault", async () => {
    writeStates(LEGACY_STATE);
    failingCommand = "sync-config";

    const { manager, logged } = loadedManager();

    await manager.applyPendingConfigs();

    expect(
      logged.some((line) =>
        line.includes("Failed to apply sync config for v1"),
      ),
    ).toBe(true);

    manager.autoStartAll();

    expect(spawned).toHaveLength(1);
    expect(manager.getState("v1").status).toBe("running");
  });
});

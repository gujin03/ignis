const auth = require("./auth");
const obCli = require("./ob-cli");
const { sanitizeError } = require("@ignis/server-core");

function mountRoutes(router, plugin) {
  router.get("/status", (req, res) => {
    const ctx = plugin.getCtx();
    const obStatus = plugin.getObStatus();

    const tokenInfo = auth.getTokenInfo(ctx.dataDir);

    res.json({
      installed: obStatus?.installed || false,
      version: obStatus?.version || null,
      authenticated: auth.isAuthenticated(ctx.dataDir),
      email: tokenInfo?.email || null,
      name: tokenInfo?.name || null,
    });
  });

  router.post("/login", (req, res) => {
    const ctx = plugin.getCtx();
    const { token, email, name } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    try {
      auth.saveToken(ctx.dataDir, { token, email: email || null, name: name || null });
      ctx.log(`Auth token saved${email ? ` for ${email}` : ""}`);
      res.json({ success: true });
    } catch (e) {
      ctx.log(`Login failed: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.post("/logout", (req, res) => {
    const ctx = plugin.getCtx();

    try {
      auth.clearToken(ctx.dataDir);
      ctx.log("Auth token cleared");
      res.json({ success: true });
    } catch (e) {
      ctx.log(`Logout failed: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.post("/setup", async (req, res) => {
    const ctx = plugin.getCtx();
    const syncManager = plugin.getSyncManager();
    const { vaultId, remoteVault, remoteVaultName, vaultPassword, deviceName, mode } = req.body;

    if (!vaultId || !remoteVault) {
      return res.status(400).json({ error: "vaultId and remoteVault are required" });
    }

    if (!auth.isAuthenticated(ctx.dataDir)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const vaultPath = ctx.config.getVaultPath(vaultId);

    if (!vaultPath) {
      return res.status(404).json({ error: "Vault not found" });
    }

    try {
      const state = await syncManager.setupSync(vaultId, vaultPath, remoteVault, {
        remoteVaultName,
        vaultPassword,
        deviceName,
        mode,
      });

      res.json({ success: true, state });
    } catch (e) {
      ctx.log(`Failed to setup sync: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.post("/start", (req, res) => {
    const ctx = plugin.getCtx();
    const syncManager = plugin.getSyncManager();
    const { vaultId } = req.body;

    if (!vaultId) {
      return res.status(400).json({ error: "vaultId is required" });
    }

    try {
      const state = syncManager.startSync(vaultId);
      res.json({ success: true, state });
    } catch (e) {
      ctx.log(`Failed to start sync: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.post("/stop", (req, res) => {
    const ctx = plugin.getCtx();
    const syncManager = plugin.getSyncManager();
    const { vaultId } = req.body;

    if (!vaultId) {
      return res.status(400).json({ error: "vaultId is required" });
    }

    try {
      const state = syncManager.stopSync(vaultId);
      res.json({ success: true, state });
    } catch (e) {
      ctx.log(`Failed to stop sync: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.post("/unlink", async (req, res) => {
    const ctx = plugin.getCtx();
    const syncManager = plugin.getSyncManager();
    const { vaultId } = req.body;

    if (!vaultId) {
      return res.status(400).json({ error: "vaultId is required" });
    }

    try {
      await syncManager.unlinkVault(vaultId);
      res.json({ success: true });
    } catch (e) {
      ctx.log(`Failed to unlink vault: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.get("/logs", (req, res) => {
    const syncManager = plugin.getSyncManager();
    const { vaultId, limit } = req.query;

    if (!vaultId) {
      return res.status(400).json({ error: "vaultId is required" });
    }

    const logs = syncManager.getLogs(vaultId, limit ? parseInt(limit) : 100);
    res.json({ logs });
  });

  router.get("/vaults", (req, res) => {
    const syncManager = plugin.getSyncManager();
    res.json({ vaults: syncManager.getAllStates() });
  });

  router.post("/create-remote-vault", async (req, res) => {
    const ctx = plugin.getCtx();
    const { name, encryption, password, region } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    if (!auth.isAuthenticated(ctx.dataDir)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const args = ["sync-create-remote", "--name", name];

    if (encryption) {
      args.push("--encryption", encryption);
    }

    if (password) {
      args.push("--password", password);
    }

    if (region) {
      args.push("--region", region);
    }

    try {
      await obCli.runCommand(args);
      ctx.log(`Created remote vault: ${name}`);
      res.json({ success: true });
    } catch (e) {
      ctx.log(`Failed to create remote vault: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });

  router.get("/remote-vaults", async (req, res) => {
    const ctx = plugin.getCtx();

    if (!auth.isAuthenticated(ctx.dataDir)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const result = await obCli.runCommand(["sync-list-remote"]);
      const vaults = parseRemoteVaults(result.stdout);
      res.json({ vaults });
    } catch (e) {
      ctx.log(`Failed to list remote vaults: ${e.message}`);
      res.status(500).json(sanitizeError(e));
    }
  });
}

function parseRemoteVaults(stdout) {
  const lines = stdout.trim().split("\n");
  const vaults = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("Available")) {
      continue;
    }

    // Format: [vaultId]  "[vaultName]"  ([region])
    const match = trimmed.match(/^([a-f0-9]+)\s+"([^"]+)"\s+\(([^)]+)\)/);

    if (match) {
      vaults.push({ id: match[1], name: match[2], region: match[3] });
    }
  }

  return vaults;
}

module.exports = { mountRoutes };

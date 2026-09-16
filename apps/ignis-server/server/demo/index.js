// Demo mode entrypoint.
//
// Each visitor gets an isolated session with up to N session-prefixed vaults, cleaned up after inactivity.
// The proxy is allowlisted, Obsidian account login is blocked to discourage inputing credentials in a demo environment.

const config = require("../config");

const { cleanupExpired } = require("./demo-cleanup");
const {
  activityHeartbeat,
  captureOriginalVaultName,
  inboundTranslator,
  outboundTranslator,
  vaultsPerSessionEnforcer,
  quotaEnforcer,
  proxyAllowlist,
  trackVaultLifecycle,
  pluginsBlocker,
  pageLoadHandler,
  provisionEndpoint,
} = require("./demo-middleware");
const { wireWebSocket } = require("./demo-ws");

// Mount HTTP middleware.
// Call before the API routes mount so this middleware intercepts first.
function setupDemo(app) {
  if (!config.demoMode) {
    return;
  }

  console.log("[demo] Demo mode enabled");
  console.log(`[demo] Max sessions: ${config.demoMaxSessions}`);
  console.log(`[demo] Vaults per session: ${config.demoVaultsPerSession}`);
  console.log(
    `[demo] Quota per session: ${config.demoSessionQuotaBytes} bytes`,
  );
  console.log(`[demo] Inactivity timeout: ${config.demoTimeoutMs} ms`);

  // Page-load capacity gate (before static html)
  app.use(pageLoadHandler);

  // Heartbeat on every request so /api/ext/*, /vault-files/*, etc. keep the session alive too.
  app.use(activityHeartbeat);

  // Provisioning endpoint for the client to call when no vault is selected
  app.get("/api/demo/provision", provisionEndpoint);

  // Snapshot the user-visible name before inbound translation rewrites it.
  app.use(
    ["/api/vault", "/api/fs", "/api/bootstrap"],
    captureOriginalVaultName,
  );

  // Inbound: rewrite ?vault= and bodies to prefixed storage names
  app.use(["/api/vault", "/api/fs", "/api/bootstrap"], inboundTranslator);

  // Outbound: filter vault lists and strip prefixes from responses
  app.use(["/api/vault", "/api/fs", "/api/bootstrap"], outboundTranslator);

  // quota enforcement
  app.use("/api/vault", vaultsPerSessionEnforcer);
  app.use("/api/fs", quotaEnforcer);

  // Track vault create/rename/delete in session.vaults
  app.use("/api/vault", trackVaultLifecycle);

  // Restrict the CORS proxy
  app.use("/api/proxy", proxyAllowlist);

  // Hide server-side plugins (headless-sync) from the demo UI
  app.use("/api/plugins", pluginsBlocker);

  // Plugin routes are not exposed in demo mode.
  app.use("/api/ext", (req, res) => {
    res.status(403).json({ error: "Plugin routes are disabled in demo mode" });
  });

  // Server settings are-fixed in demo mode.
  app.use("/api/settings", (req, res) => {
    res.status(403).json({ error: "Settings are disabled in demo mode" });
  });

  // Cleanup timer
  const interval = setInterval(() => {
    cleanupExpired().catch((e) =>
      console.warn("[demo] Cleanup error:", e.message),
    );
  }, 60 * 1000);

  if (interval.unref) {
    interval.unref();
  }
}

// Wire WebSocket-level vault translation. Called after setupWebSocket.
function wireDemoWebSocket(server) {
  if (!config.demoMode) {
    return;
  }

  wireWebSocket(server);
}

module.exports = { setupDemo, wireDemoWebSocket };

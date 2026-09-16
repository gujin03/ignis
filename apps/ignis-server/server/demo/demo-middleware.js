// Demo Express middleware.

const fs = require("fs");
const path = require("path");
const url = require("url");

const config = require("../config");
const {
  COOKIE_NAME,
  sessions,
  makeStorageName,
  tryParseUserVaultName,
  isValidUserVaultName,
  stripStoragePrefix,
  parseCookies,
  setSessionCookie,
  getOrCreateSession,
  touchSession,
} = require("./demo-sessions");
const { ensureDefaultVault } = require("./demo-provision");
const { sanitizeError } = require("@ignis/server-core");

const ALLOWED_PROXY_HOSTS = new Set([
  "releases.obsidian.md",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "api.github.com",
  "codeload.github.com",
]);

// Bump lastActivity on any cookie-bearing request.
function activityHeartbeat(req, res, next) {
  const cookies = parseCookies(req);
  const sessionId = cookies[COOKIE_NAME];

  if (sessionId && sessions.has(sessionId)) {
    touchSession(sessionId);
  }

  next();
}

// Snapshot the user-visible vault name before inbound translation rewrites it.
function captureOriginalVaultName(req, res, next) {
  if (req.query && req.query.vault) {
    req._demoOriginalVault = req.query.vault;
  }

  if (req.body && req.body.vault) {
    req._demoOriginalVault = req.body.vault;
  }

  next();
}

// Rewrite inbound `?vault=` and request body vault names from user-visible to storage-prefixed.
// Tags the request with the session id.
function inboundTranslator(req, res, next) {
  const sessionId = getOrCreateSession(req, res, { peek: true });

  if (!sessionId) {
    return next();
  }

  touchSession(sessionId);
  req._demoSessionId = sessionId;

  if (req.query && req.query.vault) {
    req.query.vault = makeStorageName(sessionId, req.query.vault);
  }

  if (req.body) {
    if (req.body.vault) {
      req.body.vault = makeStorageName(sessionId, req.body.vault);
    }

    // Vault create/rename pass the new name as `name`
    if (req.body.name && (req.path === "/create" || req.path === "/rename")) {
      if (!isValidUserVaultName(req.body.name)) {
        return res.status(400).json({ error: "Invalid vault name" });
      }

      req.body.name = makeStorageName(sessionId, req.body.name);
    }
  }

  next();
}

function rewriteVaultIdInPlace(obj, sessionId) {
  if (!obj || typeof obj !== "object") {
    return;
  }

  if (typeof obj.id === "string") {
    const userName = tryParseUserVaultName(sessionId, obj.id);

    if (userName !== null) {
      obj.id = userName;
      obj.name = userName;
    }
  }
}

// filter/translate vault names in the JSON response body from storage-prefixed to user-visible
function outboundTranslator(req, res, next) {
  const sessionId = req._demoSessionId;

  if (!sessionId) {
    return next();
  }

  const origJson = res.json.bind(res);

  // clean path for UI display.
  const prefix = "demo-" + sessionId + "__";
  const stripPrefix = (s) => stripStoragePrefix(s, prefix);

  res.json = function (body) {
    if (Array.isArray(body)) {
      // /api/vault/list shape: [{ id, name, path }, ...]
      const filtered = [];

      for (const entry of body) {
        const userName = tryParseUserVaultName(sessionId, entry.id);

        if (userName !== null) {
          filtered.push({
            id: userName,
            name: userName,
            path: stripPrefix(entry.path),
          });
        }
      }

      return origJson(filtered);
    }

    if (body && typeof body === "object") {
      // /api/vault/info, /api/bootstrap, /api/vault/create response
      rewriteVaultIdInPlace(body, sessionId);
      rewriteVaultIdInPlace(body.vault, sessionId);

      if (typeof body.path === "string") {
        body.path = stripPrefix(body.path);
      }

      if (body.vault && typeof body.vault.path === "string") {
        body.vault.path = stripPrefix(body.vault.path);
      }

      if (Array.isArray(body.vaultList)) {
        body.vaultList = body.vaultList
          .map((v) => {
            const userName = tryParseUserVaultName(sessionId, v.id);

            if (userName === null) {
              return null;
            }

            return {
              id: userName,
              name: userName,
              path: stripPrefix(v.path),
            };
          })
          .filter(Boolean);
      }
    }

    return origJson(body);
  };

  next();
}

function vaultsPerSessionEnforcer(req, res, next) {
  if (req.path !== "/create" || req.method !== "POST") {
    return next();
  }

  const sessionId = req._demoSessionId;

  if (!sessionId) {
    return next();
  }

  const s = sessions.get(sessionId);

  if (s && s.vaults.size >= config.demoVaultsPerSession) {
    return res.status(507).json({
      error: `Demo limit: max ${config.demoVaultsPerSession} vaults per session`,
    });
  }

  next();
}

function quotaEnforcer(req, res, next) {
  if (
    req.method !== "POST" ||
    (req.path !== "/writeFile" && req.path !== "/appendFile")
  ) {
    return next();
  }

  const sessionId = req._demoSessionId;

  if (!sessionId) {
    return next();
  }

  const s = sessions.get(sessionId);

  if (!s) {
    return next();
  }

  // Estimate the size of the incoming payload
  const content = req.body && req.body.content;
  let size = 0;

  if (typeof content === "string") {
    size = req.body.base64
      ? Math.floor((content.length * 3) / 4)
      : Buffer.byteLength(content, "utf-8");
  }

  if (s.bytesUsed + size > config.demoSessionQuotaBytes) {
    return res.status(507).json({
      error: `Demo quota exceeded (${config.demoSessionQuotaBytes} bytes per session)`,
    });
  }

  // Optimistically add. recomputeBytes() corrects drift periodically
  s.bytesUsed += size;
  next();
}

function proxyAllowlist(req, res, next) {
  const target = req.body && req.body.url;

  if (!target) {
    return next();
  }

  let host;

  try {
    host = new url.URL(target).hostname;
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!ALLOWED_PROXY_HOSTS.has(host)) {
    return res
      .status(403)
      .json({ error: `Domain not allowed in demo mode: ${host}` });
  }

  next();
}

function trackVaultLifecycle(req, res, next) {
  const sessionId = req._demoSessionId;

  if (!sessionId) {
    return next();
  }

  // Hook res.json to update session.vaults on successful create/delete/rename
  const origJson = res.json.bind(res);

  res.json = function (body) {
    const isOk =
      res.statusCode < 400 && body && typeof body === "object" && body.ok;

    if (isOk) {
      const s = sessions.get(sessionId);

      if (s) {
        if (req.path === "/create" && body.id) {
          // body.id is storage-prefixed at this point (outboundTranslator runs after us).
          // Translate to the user-visible name so it matches what pageLoadHandler queries with.
          const userName = tryParseUserVaultName(sessionId, body.id);

          if (userName !== null) {
            s.vaults.add(userName);
          } else {
            console.warn(
              "[demo] trackVaultLifecycle: could not parse user name from create response id:",
              body.id,
            );
          }
        } else if (req.path === "/rename") {
          const oldName = req._demoOriginalVault;

          if (oldName) {
            s.vaults.delete(oldName);
          }

          if (body.id) {
            const userName = tryParseUserVaultName(sessionId, body.id);

            if (userName !== null) {
              s.vaults.add(userName);
            } else {
              console.warn(
                "[demo] trackVaultLifecycle: could not parse user name from rename response id:",
                body.id,
              );
            }
          }
        } else if (req.method === "DELETE" && req.path === "/remove") {
          const removed = req._demoOriginalVault;

          if (removed) {
            s.vaults.delete(removed);
          }
        }
      }
    }

    return origJson(body);
  };

  next();
}

// Server-side plugins (headless-sync) have no place in a sandbox.
// Hide the list and refuse enable/disable calls.
function pluginsBlocker(req, res, next) {
  if (req.method === "GET") {
    return res.json([]);
  }

  return res
    .status(403)
    .json({ error: "Server plugins are disabled in demo mode" });
}

const CAPACITY_HTML = fs.readFileSync(
  path.join(__dirname, "demo-capacity.html"),
  "utf-8",
);

function pageLoadHandler(req, res, next) {
  if (req.path !== "/" && req.path !== "/index.html") {
    return next();
  }

  const cookies = parseCookies(req);
  let sessionId = cookies[COOKIE_NAME];
  let session =
    sessionId && sessions.has(sessionId) ? sessions.get(sessionId) : null;

  if (!session) {
    if (sessions.size >= config.demoMaxSessions) {
      res.status(503).type("html").send(CAPACITY_HTML);
      return;
    }

    // Cookie missing or session expired/cleaned. Create or restore.
    sessionId = getOrCreateSession(req, res);
    session = sessionId ? sessions.get(sessionId) : null;
  } else {
    // Refresh max-age on every page load so long-tab users stay signed in.
    setSessionCookie(res, sessionId);
  }

  // Recovery: if the requested vault no longer exists, redirect to / so the client's provisioning flow recreates it.
  const requestedVault = req.query?.vault;

  if (requestedVault && session) {
    const storageName = makeStorageName(sessionId, requestedVault);
    const vaultPath = config.getVaultPath(storageName);
    const stillExists =
      session.vaults.has(requestedVault) &&
      vaultPath &&
      fs.existsSync(vaultPath);

    if (!stillExists) {
      return res.redirect(302, "/");
    }
  }

  next();
}

// GET /api/demo/provision - returns the default vault's user-visible name, creating it if needed.
// Client calls this when no ?vault= is in the URL.
function provisionEndpoint(req, res) {
  const sessionId = getOrCreateSession(req, res);

  if (!sessionId) {
    return res.status(503).json({ error: "Demo at capacity" });
  }

  ensureDefaultVault(sessionId)
    .then((userVaultName) => {
      if (!userVaultName) {
        return res.status(500).json({ error: "Provisioning failed" });
      }

      res.json({ vault: userVaultName });
    })
    .catch((e) => {
      console.error("[demo] provision error:", e);
      res.status(500).json(sanitizeError(e));
    });
}

module.exports = {
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
};

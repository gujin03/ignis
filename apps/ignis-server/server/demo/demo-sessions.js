// In-memory session map keyed by cookie value.
//
// Each entry tracks the user's vault names, last-activity timestamp, and bytes used.
// On disk, vaults are stored under a session-prefixed name so two sessions can both have a vault called "Notes".

const crypto = require("crypto");
const config = require("../config");

const COOKIE_NAME = "ignis-demo";
const PREFIX_SEPARATOR = "__";

// sessionId -> { lastActivity, vaults: Set<userVaultName>, bytesUsed }
const sessions = new Map();

function newSessionId() {
  return crypto.randomBytes(12).toString("hex");
}

// accept only the format we issue.
const SESSION_ID_RE = /^[a-f0-9]{24}$/;

function isValidSessionId(id) {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

function prefixFor(sessionId) {
  return "demo-" + sessionId + PREFIX_SEPARATOR;
}

function makeStorageName(sessionId, userVaultName) {
  return prefixFor(sessionId) + userVaultName;
}

function tryParseUserVaultName(sessionId, storageName) {
  const prefix = prefixFor(sessionId);

  if (storageName && storageName.startsWith(prefix)) {
    return storageName.slice(prefix.length);
  }

  return null;
}

// Strip the session storage prefix from a value such as a vault path.
function stripStoragePrefix(value, prefix) {
  return typeof value === "string" ? value.replace(prefix, "") : value;
}

// User-visible demo vault names must not collide with the storage-prefix scheme, or the prefix strip on the way back out mangles them.
function isValidUserVaultName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= 64 &&
    !name.includes(PREFIX_SEPARATOR) &&
    !name.startsWith("demo-")
  );
}

function parseCookies(req) {
  const header = req.headers.cookie;

  if (!header) {
    return {};
  }

  const out = {};

  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");

    if (eq < 0) {
      continue;
    }

    out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
  }

  return out;
}

function setSessionCookie(res, sessionId) {
  const maxAgeSeconds = Math.floor(config.demoTimeoutMs / 1000);

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`,
  );
}

// Resolve the session for a request. If none exists, create one (unless options.peek is true).
function getOrCreateSession(req, res, options = {}) {
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  const existing = isValidSessionId(raw) ? raw : null;

  if (existing && sessions.has(existing)) {
    return existing;
  }

  if (existing && !sessions.has(existing)) {
    if (sessions.size >= config.demoMaxSessions) {
      return null;
    }

    // Cookie outlived in-memory session. reuse the id to keep the prefix.
    sessions.set(existing, {
      lastActivity: Date.now(),
      vaults: new Set(),
      bytesUsed: 0,
    });
    return existing;
  }

  if (options.peek) {
    return null;
  }

  if (sessions.size >= config.demoMaxSessions) {
    return null;
  }

  const sessionId = newSessionId();

  sessions.set(sessionId, {
    lastActivity: Date.now(),
    vaults: new Set(),
    bytesUsed: 0,
  });

  setSessionCookie(res, sessionId);
  return sessionId;
}

function touchSession(sessionId) {
  const s = sessions.get(sessionId);

  if (s) {
    s.lastActivity = Date.now();
  }
}

module.exports = {
  COOKIE_NAME,
  PREFIX_SEPARATOR,
  sessions,
  prefixFor,
  makeStorageName,
  tryParseUserVaultName,
  isValidUserVaultName,
  stripStoragePrefix,
  parseCookies,
  setSessionCookie,
  getOrCreateSession,
  touchSession,
};

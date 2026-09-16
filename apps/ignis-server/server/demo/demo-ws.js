// Vault prefix translation for WebSocket upgrades.
//
// ws.js validates the upgrade's `?vault=` against config.vaults.
// We translate to the storage-prefixed name before it sees the request, otherwise the handshake fails and the client reconnect-loops.

const url = require("url");

const {
  COOKIE_NAME,
  sessions,
  parseCookies,
  makeStorageName,
  tryParseUserVaultName,
  touchSession,
} = require("./demo-sessions");

function wireWebSocket(server) {
  const origEmit = server.emit.bind(server);

  server.emit = function (event, req, ...rest) {
    if (event === "upgrade") {
      const cookies = parseCookies(req);
      const sessionId = cookies[COOKIE_NAME];

      if (sessionId && sessions.has(sessionId)) {
        const u = new url.URL(req.url, "http://localhost");
        const userVault = u.searchParams.get("vault");

        if (userVault && !userVault.startsWith("demo-")) {
          u.searchParams.set("vault", makeStorageName(sessionId, userVault));
          req.url = u.pathname + u.search;
        } else if (
          userVault &&
          userVault.startsWith("demo-") &&
          tryParseUserVaultName(sessionId, userVault) === null
        ) {
          // An already-prefixed vault that isn't this session's: refuse the upgrade.
          const socket = rest[0];

          if (socket && socket.writable) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
          }

          return;
        }

        touchSession(sessionId);
      }
    }

    return origEmit(event, req, ...rest);
  };
}

module.exports = { wireWebSocket };

const express = require("express");
const settings = require("../../settings");
const { sanitizeError } = require("@ignis/server-core");
const {
  signinCredentials,
  resolveSignin,
} = require("../../obsidian-account/signin");
const { assertPublicUrl } = require("./ssrf-guard");
const { relayOnce } = require("./relay");

const router = express.Router();

// POST /api/proxy - forward a request to an external URL to bypass CORS.
router.post("/", async (req, res) => {
  const { url, method, headers, body, binary } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing url" });
  }

  const proxyMode = settings.get("proxyMode");

  if (proxyMode === "disabled") {
    return res.status(403).json({
      error:
        "Ignis blocked the connection: proxy access is disabled (Settings > Ignis > General > Security).",
      code: "disabled",
    });
  }

  try {
    await assertPublicUrl(url);
  } catch (e) {
    // assertPublicUrl throws deliberate, safe guard messages (blocked host, bad scheme); don't use sanitizeError.
    // leak-allow
    const body = { error: e.message, ...e.block };
    return res.status(e.statusCode || 400).json(body);
  }

  if (proxyMode === "allowlist") {
    const allowlist = settings.get("proxyAllowlist");
    const host = new URL(url).hostname;

    if (!allowlist.includes(host)) {
      return res.status(403).json({
        error: `Ignis blocked a connection to ${host}: the host is not in the proxy host allowlist (Settings > Ignis > General > Security).`,
        code: "allowlist",
        host,
      });
    }
  }

  try {
    const reqBody =
      binary && typeof body === "string" ? Buffer.from(body, "base64") : body;

    const relayArgs = {
      url,
      method: method || "GET",
      headers: headers || {},
      body: reqBody,
    };

    const credentials = signinCredentials(req.body);
    let relayed = await relayOnce(relayArgs);

    if (credentials) {
      relayed = await resolveSignin(credentials, relayed, () =>
        relayOnce(relayArgs),
      );
    }

    if (relayed.tooLarge) {
      return res.status(413).json({ error: "Upstream response too large" });
    }

    res.json(relayed);
  } catch (e) {
    if (e.block) {
      // leak-allow
      const body = { error: e.message, ...e.block };
      return res.status(e.statusCode || 403).json(body);
    }

    res.status(e.statusCode || 502).json(sanitizeError(e));
  }
});

module.exports = router;

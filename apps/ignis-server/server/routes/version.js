const express = require("express");
const { getSemver, getBuild } = require("../version");
const config = require("../config");

const router = express.Router();

// `version` is the display-friendly SemVer. `build` is the per-build stamp for cache-bust.
router.get("/", (req, res) => {
  res.json({
    version: getSemver(),
    build: getBuild(),
    obsidianVersion: config.obsidianVersion,
  });
});

module.exports = router;

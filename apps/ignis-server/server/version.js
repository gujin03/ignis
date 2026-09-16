const fs = require("fs");
const path = require("path");

let cached = null;

function load() {
  if (cached) {
    return cached;
  }

  // Production: root build.js writes this next to us.
  try {
    cached = JSON.parse(
      fs.readFileSync(path.join(__dirname, "build-info.json"), "utf-8"),
    );
    return cached;
  } catch {}

  // Local dev fallback. Read root package.json.
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "..", "..", "package.json"),
        "utf-8",
      ),
    );
    cached = {
      semver: pkg.version,
      build: "dev",
      version: `${pkg.version}-dev`,
    };
    return cached;
  } catch {}

  cached = { semver: "0.0.0", build: "unknown", version: "0.0.0-unknown" };
  return cached;
}

function getVersion() {
  return load().version;
}

function getSemver() {
  return load().semver;
}

function getBuild() {
  return load().build;
}

module.exports = { getVersion, getSemver, getBuild };

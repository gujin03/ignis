// node build-image.js [--push] [--no-latest]
//
// --push       build mulit-arch (amd64+arm64) and push as a manifest list, tagged with the package.json version and latest
// --no-latest  don't move the latest tag
//
// Without --push, builds the host arch and loads it as <image>:dev.

const { spawnSync, execSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const IMAGE = process.env.IGNIS_IMAGE || "nobbe/ignis";
const BUILDER = "ignis-builder";
const PLATFORMS = "linux/amd64,linux/arm64";

const args = process.argv.slice(2);
const push = args.includes("--push");
const noLatest = args.includes("--no-latest");
const unknown = args.filter((a) => a !== "--push" && a !== "--no-latest");

if (unknown.length > 0) {
  console.error("[build-image] unknown arguments:", unknown.join(" "));
  console.error("usage: node build-image.js [--push] [--no-latest]");
  process.exit(1);
}

const version = require(path.join(repoRoot, "package.json")).version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(
    `[build-image] version "${version}" is not plain X.Y.Z, refusing to tag`,
  );
  process.exit(1);
}

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: repoRoot,
    stdio: "inherit",
    ...opts,
  });

  return result.status === 0;
}

let dirty = "";

try {
  dirty = execSync("git status --porcelain", { cwd: repoRoot })
    .toString()
    .trim();
} catch {
  console.warn("[build-image] could not check git status");
}

if (dirty) {
  console.warn(
    "[build-image] WARNING: working tree has uncommitted changes; the image will not match the committed source",
  );
}

const inspect = spawnSync("docker", ["buildx", "inspect", BUILDER], {
  stdio: "ignore",
});

if (inspect.status !== 0) {
  console.log(`[build-image] creating buildx builder ${BUILDER}`);

  const created = run("docker", [
    "buildx",
    "create",
    "--name",
    BUILDER,
    "--driver",
    "docker-container",
  ]);

  if (!created) {
    process.exit(1);
  }
}

const buildArgs = [
  "buildx",
  "build",
  "--builder",
  BUILDER,
  "-f",
  "apps/ignis-server/Dockerfile",
];

if (push) {
  buildArgs.push("--platform", PLATFORMS, "-t", `${IMAGE}:${version}`);

  if (!noLatest) {
    buildArgs.push("-t", `${IMAGE}:latest`);
  }

  buildArgs.push("--push");
  console.log(
    `[build-image] building ${PLATFORMS} and pushing ${IMAGE}:${version}${noLatest ? "" : ` + ${IMAGE}:latest`}`,
  );
} else {
  // Host arch only. Multi-arch builds can't be loaded into the local image store.
  buildArgs.push("-t", `${IMAGE}:dev`, "--load");
  console.log(`[build-image] local build, loading ${IMAGE}:dev`);
}

buildArgs.push(".");

process.exit(run("docker", buildArgs) ? 0 : 1);

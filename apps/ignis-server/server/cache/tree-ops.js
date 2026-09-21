const fs = require("fs");
const fsp = fs.promises;
const { fromVaultRel } = require("@ignis/server-core");

function fileNode(s) {
  return {
    type: "file",
    size: s.size,
    mtime: s.mtimeMs,
    ctime: s.ctimeMs,
  };
}

async function statFileNode(absPath) {
  return fileNode(await fsp.stat(absPath));
}

async function statDirMtime(absPath) {
  try {
    const s = await fsp.stat(absPath);

    return s.mtimeMs;
  } catch {
    return 0; // force invalidation
  }
}

function isRepresentable(relPath) {
  return relPath !== "" && !relPath.split("/").includes("..");
}

function setNode(tree, relPath, node) {
  const current = tree[relPath];

  if (
    current &&
    current.type === node.type &&
    current.size === node.size &&
    current.mtime === node.mtime &&
    current.ctime === node.ctime
  ) {
    return false;
  }

  tree[relPath] = node;

  return true;
}

async function addMissingParentDirs(vaultPath, entry, relPath) {
  const parts = relPath.split("/");
  parts.pop();

  let ancestor = "";
  let changed = false;

  for (const part of parts) {
    ancestor = ancestor ? ancestor + "/" + part : part;

    const node = entry.response.tree[ancestor];

    if (!node || node.type !== "directory") {
      entry.response.tree[ancestor] = { type: "directory" };
      changed = true;
    }

    // never refresh recorded directory mtimes, ensure dir mtime only mutated by external changes
    if (!(ancestor in entry.dirMtimes)) {
      entry.dirMtimes[ancestor] = await statDirMtime(
        fromVaultRel(vaultPath, ancestor),
      );
      changed = true;
    }
  }

  return changed;
}

function subtreeKeys(map, root) {
  const prefix = root + "/";

  return Object.keys(map).filter(
    (key) => key === root || key.startsWith(prefix),
  );
}

function sweepPrefix(entry, root) {
  let changed = false;

  for (const key of subtreeKeys(entry.response.tree, root)) {
    delete entry.response.tree[key];
    changed = true;
  }

  for (const key of subtreeKeys(entry.dirMtimes, root)) {
    delete entry.dirMtimes[key];
    changed = true;
  }

  return changed;
}

function removePath(entry, relPath) {
  const node = entry.response.tree[relPath];
  // if directory, also clear children
  const isDirectory = node
    ? node.type === "directory"
    : relPath in entry.dirMtimes;

  if (isDirectory) {
    return sweepPrefix(entry, relPath);
  }

  if (!node) {
    return false;
  }

  delete entry.response.tree[relPath];

  return true;
}

async function movePath(vaultPath, entry, from, to) {
  if (to === from) {
    return false;
  }

  const tree = entry.response.tree;
  const moved = subtreeKeys(tree, from);
  const movedDirs = subtreeKeys(entry.dirMtimes, from);

  if (moved.length === 0 && movedDirs.length === 0) {
    const s = await fsp.stat(fromVaultRel(vaultPath, to));

    if (s.isDirectory()) {
      throw new Error(`rename of an unrecorded directory: ${from}`);
    }

    const added = await addMissingParentDirs(vaultPath, entry, to);
    const stored = setNode(tree, to, fileNode(s));

    return added || stored;
  }

  sweepPrefix(entry, to);

  for (const key of moved) {
    tree[to + key.slice(from.length)] = tree[key];
    delete tree[key];
  }

  for (const key of movedDirs) {
    entry.dirMtimes[to + key.slice(from.length)] = entry.dirMtimes[key];
    delete entry.dirMtimes[key];
  }

  await addMissingParentDirs(vaultPath, entry, to);

  return true;
}

module.exports = {
  fileNode,
  statFileNode,
  statDirMtime,
  isRepresentable,
  setNode,
  addMissingParentDirs,
  subtreeKeys,
  sweepPrefix,
  removePath,
  movePath,
};

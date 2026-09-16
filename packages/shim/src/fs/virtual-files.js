// Virtual plugin source served from memory; the fs shim's read path checks here before disk.

import { normalize } from "../util/path.js";

const virtualFiles = new Map();

export function setVirtualFile(path, content) {
  const normalized = normalize(path);

  if (normalized.split("/").includes("..")) {
    throw new Error(`virtual file path may not contain '..': ${path}`);
  }

  virtualFiles.set(normalized, content);
}

export function removeVirtualFile(path) {
  virtualFiles.delete(normalize(path));
}

export function getVirtualFile(path) {
  return virtualFiles.get(normalize(path));
}

export function hasVirtualFile(path) {
  return virtualFiles.has(normalize(path));
}

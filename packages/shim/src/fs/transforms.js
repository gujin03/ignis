// FS shim translation registry.
// Path resolvers map logical paths to physical paths; read transforms post-process bytes after a read; write transforms pre-process bytes before a write.
// All hooks run at the shim's public surface, so caches and transport see only physical paths and as-stored bytes.

import { normalize } from "../util/path.js";

// --- Path resolvers ---

const pathResolvers = [];

export function registerPathResolver(matcher, resolver) {
  pathResolvers.push({ matcher, resolver });
}

// resolved is the physical path.
// redirected is true when a path resolver sent the request to a different path.
export function resolvePathInfo(path) {
  const norm = normalize(path);

  for (const { matcher, resolver } of pathResolvers) {
    try {
      if (matcher(norm)) {
        const resolved = resolver(norm);

        if (typeof resolved === "string" && resolved.length > 0) {
          return { resolved, redirected: true };
        }
      }
    } catch {}
  }

  return { resolved: norm, redirected: false };
}

export function resolvePath(path) {
  return resolvePathInfo(path).resolved;
}

// --- Read transforms ---

const readTransforms = new Map();

export function registerReadTransform(path, fn) {
  readTransforms.set(normalize(path), fn);
}

export function removeReadTransform(path) {
  readTransforms.delete(normalize(path));
}

export function applyReadTransform(path, data) {
  const fn = readTransforms.get(normalize(path));

  if (!fn) {
    return data;
  }

  try {
    return fn(data);
  } catch {
    return data;
  }
}

export function hasReadTransform(path) {
  return readTransforms.has(normalize(path));
}

// --- Write transforms ---

const writeTransforms = new Map();

export function registerWriteTransform(path, fn) {
  writeTransforms.set(normalize(path), fn);
}

export function removeWriteTransform(path) {
  writeTransforms.delete(normalize(path));
}

export function applyWriteTransform(path, data) {
  const fn = writeTransforms.get(normalize(path));

  if (!fn) {
    return data;
  }

  try {
    return fn(data);
  } catch {
    return data;
  }
}

// Test-only: clear all registered hooks.
export function _reset() {
  pathResolvers.length = 0;
  readTransforms.clear();
  writeTransforms.clear();
}

// Shared echo suppression for file watcher.
// fs operations mark paths as "locally modified" so the watcher client can skip events that originated from this client.
import { normalize } from "../util/path.js";

const ECHO_SUPPRESS_MS = 1500;
const recentOps = new Map(); // normalized path -> timestamp

export function markLocalOp(path) {
  recentOps.set(normalize(path), Date.now());
}

export function isRecentLocalOp(path) {
  const norm = normalize(path);
  const ts = recentOps.get(norm);

  if (!ts) return false;

  if (Date.now() - ts < ECHO_SUPPRESS_MS) {
    return true;
  }

  recentOps.delete(norm);
  return false;
}

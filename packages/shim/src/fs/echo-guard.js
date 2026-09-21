// Track file operations sent to server.
import { normalize } from "../util/path.js";

const ECHO_SUPPRESS_MS = 1500;
const recentOps = new Map(); // normalized path -> timestamp

let sentOps = 0;

export function markSentOp(path) {
  recentOps.set(normalize(path), Date.now());
  sentOps++;
}

export function sentOpCount() {
  return sentOps;
}

export function isRecentSentOp(path) {
  const norm = normalize(path);
  const ts = recentOps.get(norm);

  if (!ts) return false;

  if (Date.now() - ts < ECHO_SUPPRESS_MS) {
    return true;
  }

  recentOps.delete(norm);
  return false;
}

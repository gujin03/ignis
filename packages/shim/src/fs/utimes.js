import { resolvePath } from "./transforms.js";

// fs.utimes takes a numeric time in seconds; the server route and the metadata cache use milliseconds.
function toMs(time) {
  return time instanceof Date ? time.getTime() : Number(time) * 1000;
}

export function createUtimes(metadataCache, transport) {
  return function commitUtimes(path, atime, mtime) {
    const resolved = resolvePath(path);
    const mtimeMs = toMs(mtime);

    const meta = metadataCache.get(resolved);

    if (meta) {
      meta.mtime = mtimeMs;
      metadataCache.set(resolved, meta);
    }

    // The mtime update is non-critical, so the server write flushes in the background.
    transport.utimes(resolved, toMs(atime), mtimeMs).catch((e) => {
      console.error("[shim:fs] utimes flush failed:", resolved, e);
    });
  };
}

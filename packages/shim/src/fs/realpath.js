export function realpathSync(path) {
  return typeof path === "string" ? path : String(path);
}

export function realpath(path, options, callback) {
  const cb = typeof options === "function" ? options : callback;

  queueMicrotask(() => cb(null, realpathSync(path)));
}

realpath.native = realpath;
realpathSync.native = realpathSync;

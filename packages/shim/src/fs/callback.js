const CALLBACK_METHODS = [
  "stat",
  "lstat",
  "readdir",
  "readFile",
  "writeFile",
  "appendFile",
  "unlink",
  "rename",
  "mkdir",
  "rmdir",
  "rm",
  "copyFile",
  "access",
  "utimes",
  "chmod",
];

export function createFsCallbacks(fsPromises) {
  const callbacks = {};

  for (const name of CALLBACK_METHODS) {
    callbacks[name] = function (...args) {
      const callback = args.pop();

      fsPromises[name](...args).then(
        (result) => callback(null, result),
        (err) => callback(err),
      );
    };
  }

  return callbacks;
}

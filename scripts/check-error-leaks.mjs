// Guards the error-message leak class.
// `error: e.message` in a server response leaks internal details (absolute paths, stack hints) to HTTP clients.
// sanitizeError(e) is the safe form. Use `leak-allow` to mark a deliberately-safe message.
// Runs as part of `npm run lint`.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOTS = ["apps/ignis-server/server", "packages/server-core/src"];
const PATTERN = /error:\s*[A-Za-z_$][\w$]*\.message\b/;
const ALLOW = "leak-allow";

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") {
        walk(full, out);
      }

      continue;
    }

    if (/\.(js|mjs|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
}

const files = [];

for (const root of ROOTS) {
  try {
    walk(root, files);
  } catch {
    // A missing root is not this check's concern.
  }
}

const violations = [];

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Skip comments so prose that mentions the pattern does not trip the check.
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      return;
    }

    if (!PATTERN.test(line)) {
      return;
    }

    const prev = i > 0 ? lines[i - 1] : "";

    if (line.includes(ALLOW) || prev.includes(ALLOW)) {
      return;
    }

    violations.push(`${file}:${i + 1}: ${trimmed}`);
  });
}

if (violations.length > 0) {
  console.error(
    "error-leak check: `error: e.message` reached a response without a `leak-allow` marker.",
  );
  console.error(
    "Use sanitizeError(e), or mark the line with `leak-allow` when the message is deliberately safe.\n",
  );

  for (const v of violations) {
    console.error("  " + v);
  }

  process.exit(1);
}

console.log(`error-leak check: clean (${files.length} files scanned).`);

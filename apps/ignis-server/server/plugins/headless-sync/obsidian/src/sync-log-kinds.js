const KIND_OPTIONS = [
  { kind: "all", name: "All" },
  { kind: "upload", name: "Uploads" },
  { kind: "download", name: "Downloads" },
  { kind: "deletion", name: "Deletions" },
  { kind: "conflict", name: "Conflicts" },
  { kind: "error", name: "Errors" },
  { kind: "status", name: "Status" },
];

const KIND_PREFIXES = [
  {
    kind: "error",
    prefixes: ["[stderr]", "Sync error", "Sync failed", "Error"],
  },
  { kind: "upload", prefixes: ["Uploading", "Upload complete"] },
  { kind: "download", prefixes: ["Downloading", "Downloaded", "New file"] },
  { kind: "deletion", prefixes: ["Deleting", "Removing local-only"] },
  {
    kind: "conflict",
    prefixes: [
      "Merging conflicted",
      "Merge successful",
      "Merge failed",
      "Conflicted copy stored",
      "Renaming conflicted",
      "Restoring",
      "Reverting",
      "Rejected server change",
    ],
  },
];

function kindOf(line) {
  const text = String(line).trim();

  for (const rule of KIND_PREFIXES) {
    if (rule.prefixes.some((prefix) => text.startsWith(prefix))) {
      return rule.kind;
    }
  }

  return "status";
}

module.exports = { KIND_OPTIONS, kindOf };

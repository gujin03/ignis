import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { KIND_OPTIONS, kindOf } = require("./sync-log-kinds");

describe("kindOf", () => {
  it("classifies upload lines", () => {
    expect(kindOf("Uploading notes/today.md")).toBe("upload");
    expect(kindOf("Upload complete")).toBe("upload");
  });

  it("classifies download lines", () => {
    expect(kindOf("Downloading notes/today.md")).toBe("download");
    expect(kindOf("Downloaded notes/today.md")).toBe("download");
    expect(kindOf("New file notes/today.md")).toBe("download");
  });

  it("classifies deletion lines", () => {
    expect(kindOf("Deleting notes/old.md")).toBe("deletion");
    expect(kindOf("Removing local-only file notes/old.md")).toBe("deletion");
  });

  it("classifies conflict lines", () => {
    expect(kindOf("Merging conflicted notes/today.md")).toBe("conflict");
    expect(kindOf("Merge successful")).toBe("conflict");
    expect(kindOf("Merge failed")).toBe("conflict");
    expect(kindOf("Conflicted copy stored as notes/today 1.md")).toBe(
      "conflict",
    );
    expect(kindOf("Renaming conflicted notes/today.md")).toBe("conflict");
    expect(kindOf("Restoring notes/today.md")).toBe("conflict");
    expect(kindOf("Reverting notes/today.md")).toBe("conflict");
    expect(kindOf("Rejected server change for notes/today.md")).toBe(
      "conflict",
    );
  });

  it("classifies error lines", () => {
    expect(kindOf("Error: connection refused")).toBe("error");
    expect(kindOf("Sync error: connection refused")).toBe("error");
    expect(kindOf("Sync failed")).toBe("error");
  });

  it("classifies stderr lines as errors whatever follows the prefix", () => {
    expect(kindOf("[stderr] connection refused")).toBe("error");
    expect(kindOf("[stderr] Uploading notes/today.md")).toBe("error");
  });

  it("classifies everything else as status", () => {
    expect(kindOf("Connected to remote vault")).toBe("status");
    expect(kindOf("")).toBe("status");
  });

  it("returns a kind that the option list offers", () => {
    const kinds = KIND_OPTIONS.map((option) => option.kind);

    expect(kinds).toContain(kindOf("Uploading notes/today.md"));
    expect(kinds).toContain(kindOf("Connected to remote vault"));
  });
});

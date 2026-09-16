import { describe, it, expect } from "vitest";
import { isValidWorkspaceName } from "./workspace.js";

describe("isValidWorkspaceName", () => {
  it("accepts normal workspace names", () => {
    expect(isValidWorkspaceName("Cooking")).toBe(true);
    expect(isValidWorkspaceName("My Workspace_1.2-3")).toBe(true);
  });

  it("rejects empty, over-long, and path-bearing names", () => {
    expect(isValidWorkspaceName("")).toBe(false);
    expect(isValidWorkspaceName("x".repeat(65))).toBe(false);
    expect(isValidWorkspaceName("../etc")).toBe(false);
    expect(isValidWorkspaceName("a\\b")).toBe(false);
  });
});

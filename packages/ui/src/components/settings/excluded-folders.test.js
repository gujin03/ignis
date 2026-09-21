import { describe, it, expect } from "vitest";
import {
  buildTree,
  isCovered,
  withExcluded,
  withoutExcluded,
  notInVault,
  matchesFilter,
  visiblePaths,
} from "./excluded-folders.js";

describe("buildTree", () => {
  it("returns no nodes for an empty folder list", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests a folder under its parent", () => {
    expect(buildTree(["attachments", "attachments/img"])).toEqual([
      {
        path: "attachments",
        name: "attachments",
        children: [{ path: "attachments/img", name: "img", children: [] }],
      },
    ]);
  });

  it("creates intermediate nodes when only the deepest folder is listed", () => {
    expect(buildTree(["a/b/c"])).toEqual([
      {
        path: "a",
        name: "a",
        children: [
          {
            path: "a/b",
            name: "b",
            children: [{ path: "a/b/c", name: "c", children: [] }],
          },
        ],
      },
    ]);
  });

  it("sorts siblings by name at every depth", () => {
    const tree = buildTree([
      "drafts",
      "attachments",
      "attachments/img",
      "attachments/audio",
    ]);

    expect(tree.map((node) => node.name)).toEqual(["attachments", "drafts"]);
    expect(tree[0].children.map((node) => node.name)).toEqual(["audio", "img"]);
  });

  it("gives a folder listed twice a single node", () => {
    const tree = buildTree(["notes", "notes"]);

    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe("notes");
  });
});

describe("isCovered", () => {
  it("is true when an ancestor is excluded", () => {
    expect(isCovered("attachments/img/2024", ["attachments"])).toBe(true);
  });

  it("is false for the excluded path itself", () => {
    expect(isCovered("attachments", ["attachments"])).toBe(false);
  });

  it("is false for a sibling whose name starts with an excluded name", () => {
    expect(isCovered("attachments-old", ["attachments"])).toBe(false);
  });

  it("is false when nothing is excluded", () => {
    expect(isCovered("attachments/img", [])).toBe(false);
  });
});

describe("withExcluded", () => {
  it("adds the path and sorts the result", () => {
    expect(withExcluded(["drafts"], "attachments")).toEqual([
      "attachments",
      "drafts",
    ]);
  });

  it("removes descendants the added path now covers", () => {
    const next = withExcluded(
      ["attachments/img", "attachments/img/2024", "drafts"],
      "attachments",
    );

    expect(next).toEqual(["attachments", "drafts"]);
  });

  it("keeps a sibling whose name starts with the added name", () => {
    expect(withExcluded(["attachments-old"], "attachments")).toEqual([
      "attachments",
      "attachments-old",
    ]);
  });

  it("does not duplicate a path that is already excluded", () => {
    expect(withExcluded(["attachments"], "attachments")).toEqual([
      "attachments",
    ]);
  });
});

describe("withoutExcluded", () => {
  it("removes only that path", () => {
    expect(
      withoutExcluded(["attachments", "attachments/img"], "attachments"),
    ).toEqual(["attachments/img"]);
  });

  it("sorts the result", () => {
    expect(
      withoutExcluded(["drafts", "attachments", "notes"], "notes"),
    ).toEqual(["attachments", "drafts"]);
  });

  it("leaves the list alone when the path is not excluded", () => {
    expect(withoutExcluded(["attachments"], "drafts")).toEqual(["attachments"]);
  });
});

describe("notInVault", () => {
  it("returns the excluded entries absent from the folder list, sorted", () => {
    expect(
      notInVault(["later", "attachments", "archive"], ["attachments"]),
    ).toEqual(["archive", "later"]);
  });

  it("returns nothing when every entry exists", () => {
    expect(notInVault(["attachments"], ["attachments", "drafts"])).toEqual([]);
  });

  it("counts a folder whose ancestor exists but which does not", () => {
    expect(notInVault(["attachments/img"], ["attachments"])).toEqual([
      "attachments/img",
    ]);
  });
});

describe("matchesFilter", () => {
  it("matches every path when the filter is empty", () => {
    expect(matchesFilter("attachments", "")).toBe(true);
  });

  it("matches every path when the filter is only whitespace", () => {
    expect(matchesFilter("attachments", "  ")).toBe(true);
  });

  it("ignores case", () => {
    expect(matchesFilter("Attachments", "attach")).toBe(true);
  });

  it("matches a substring anywhere in the path", () => {
    expect(matchesFilter("attachments/img", "img")).toBe(true);
    expect(matchesFilter("attachments/img", "ments/i")).toBe(true);
  });

  it("is false when the substring is absent", () => {
    expect(matchesFilter("attachments", "drafts")).toBe(false);
  });
});

describe("visiblePaths", () => {
  it("returns every folder path when the filter is empty", () => {
    const visible = visiblePaths(["attachments", "attachments/img"], "");

    expect([...visible].sort()).toEqual(["attachments", "attachments/img"]);
  });

  it("returns matching paths together with their ancestors", () => {
    const visible = visiblePaths(
      ["attachments", "attachments/img", "drafts"],
      "img",
    );

    expect([...visible].sort()).toEqual(["attachments", "attachments/img"]);
  });

  it("includes intermediate ancestors that are not folders themselves", () => {
    const visible = visiblePaths(["a/b/c"], "c");

    expect([...visible].sort()).toEqual(["a", "a/b", "a/b/c"]);
  });

  it("returns nothing when no folder matches", () => {
    expect(visiblePaths(["attachments"], "drafts").size).toBe(0);
  });
});

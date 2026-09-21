import { describe, it, expect, vi } from "vitest";
import { installReadingLock } from "./reading-lock.js";

function fakeView(mode) {
  const view = {
    modes: { preview: "preview-mode", source: "source-mode" },
    mode,
    getMode: () => view.mode,
    setMode: vi.fn((next) => {
      view.mode = next === "preview-mode" ? "preview" : "source";
    }),
  };

  return view;
}

function fakePlugin(views) {
  const handlers = new Map();
  const workspace = {
    on: (name, fn) => {
      handlers.set(name, fn);
      return { name, fn };
    },
    iterateAllLeaves: (fn) => views.forEach((view) => fn({ view })),
  };

  return {
    plugin: { app: { workspace }, registerEvent: vi.fn() },
    handlers,
  };
}

describe("installReadingLock", () => {
  it("switches open editors to reading mode on install", () => {
    const views = [fakeView("source"), fakeView("preview")];
    const { plugin } = fakePlugin(views);

    installReadingLock(plugin);

    expect(views[0].mode).toBe("preview");
    expect(views[1].setMode).not.toHaveBeenCalled();
  });

  it("re-locks after a layout change and after a leaf change", () => {
    const view = fakeView("preview");
    const { plugin, handlers } = fakePlugin([view]);

    installReadingLock(plugin);

    view.mode = "source";
    handlers.get("layout-change")();
    expect(view.mode).toBe("preview");

    view.mode = "source";
    handlers.get("active-leaf-change")();
    expect(view.mode).toBe("preview");
  });

  it("registers both workspace events with the plugin", () => {
    const { plugin } = fakePlugin([]);

    installReadingLock(plugin);

    expect(plugin.registerEvent).toHaveBeenCalledTimes(2);
  });

  it("ignores leaves that are not markdown views", () => {
    const { plugin } = fakePlugin([{}, { getMode: () => "source" }]);

    expect(() => installReadingLock(plugin)).not.toThrow();
  });
});

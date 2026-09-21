import { enterReadingMode } from "./view-mode.js";

// Keeps every markdown view in reading mode.
export function installReadingLock(plugin) {
  const workspace = plugin.app.workspace;

  const lock = () => {
    workspace.iterateAllLeaves((leaf) => {
      enterReadingMode(leaf.view);
    });
  };

  plugin.registerEvent(workspace.on("layout-change", lock));
  plugin.registerEvent(workspace.on("active-leaf-change", lock));
  lock();
}

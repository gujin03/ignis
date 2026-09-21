import { WorkspacePickerModal } from "./workspace-picker.js";

function registerOpenWorkspace(plugin) {
  plugin.addCommand({
    id: "open-workspace-in-new-tab",
    name: "Open workspace in new tab",
    callback: () => {
      new WorkspacePickerModal(plugin.app).open();
    },
  });
}

export { registerOpenWorkspace };

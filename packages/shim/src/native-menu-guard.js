// Obsidian's native-menu path uses Electron Menu APIs that can't render in a browser.
// Use transforms to keep nativeMenus = false in browser context while preserving user config on disk.
// Also disable the settings toggle and patch setConfig.

import {
  registerReadTransform,
  registerWriteTransform,
} from "./fs/transforms.js";
import { fsShim } from "./fs/index.js";

const APPEARANCE_PATH = ".obsidian/appearance.json";

// undefined = key absent on disk; write transform keeps it absent.
let preservedNativeMenus = undefined;

function snapshotAppearance() {
  try {
    const obj = JSON.parse(fsShim.readFileSync(APPEARANCE_PATH, "utf-8"));

    if ("nativeMenus" in obj) {
      preservedNativeMenus = obj.nativeMenus;
    }
  } catch {
    // File missing or malformed; preservedNativeMenus stays undefined.
  }
}

function readTransform(data) {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);

  try {
    const obj = JSON.parse(text);

    // force native menus to false since its never appropriate in a browser context.
    if (obj.nativeMenus !== false) {
      obj.nativeMenus = false;
      return JSON.stringify(obj);
    }
  } catch {}

  return data;
}

function writeTransform(data) {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);

  try {
    const obj = JSON.parse(text);

    if (preservedNativeMenus === undefined) {
      delete obj.nativeMenus;
    } else {
      obj.nativeMenus = preservedNativeMenus;
    }

    return JSON.stringify(obj);
  } catch {
    return data;
  }
}

// Prevent setting from being set during runtime.
function patchSetConfig() {
  const tryPatch = () => {
    const vault = window.app && window.app.vault;

    if (!vault || typeof vault.setConfig !== "function") {
      return false;
    }

    if (vault.__ignisNativeMenuGuarded) {
      return true;
    }

    const orig = vault.setConfig.bind(vault);

    vault.setConfig = function (key, value) {
      if (key === "nativeMenus") {
        return orig("nativeMenus", false);
      }

      return orig(key, value);
    };
    vault.__ignisNativeMenuGuarded = true;

    // set to false to override any platform default (like macOS).
    vault.setConfig("nativeMenus", false);

    return true;
  };

  if (tryPatch()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (tryPatch()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// Disable the "Native menus" toggle in appearance settings.
function disableNativeMenuToggle() {
  const apply = () => {
    document.querySelectorAll(".setting-item-name").forEach((nameEl) => {
      if (!/native.?menu/i.test(nameEl.textContent)) {
        return;
      }

      const item = nameEl.closest(".setting-item");
      const input = item && item.querySelector('input[type="checkbox"]');

      if (!input || input.__ignisDisabled) {
        return;
      }

      input.disabled = true;
      input.__ignisDisabled = true;

      const container = input.closest(".checkbox-container");

      if (container) {
        container.title =
          "Forced off in Ignis - browser context can't render native menus.";
      }
    });
  };

  const observer = new MutationObserver(apply);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function initNativeMenuGuard() {
  // Snapshot before registering the read transform so the captured value is the original on disk, not the forced value.
  snapshotAppearance();
  registerReadTransform(APPEARANCE_PATH, readTransform);
  registerWriteTransform(APPEARANCE_PATH, writeTransform);
  patchSetConfig();
  disableNativeMenuToggle();
}

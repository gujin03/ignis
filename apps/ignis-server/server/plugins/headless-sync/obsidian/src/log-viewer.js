const api = require("./api");

const CHANNEL = "plugin:headless-sync";

async function renderLogViewer(containerEl, vaultId) {
  const details = containerEl.createEl("details", {
    cls: "ignis-log-details",
  });

  details.createEl("summary", { text: "Sync logs" });

  const logBox = details.createEl("pre", { cls: "ignis-log-terminal" });
  const codeEl = logBox.createEl("code");

  let logsData;

  try {
    logsData = await api.getLogs(vaultId, 50);
  } catch (e) {
    codeEl.textContent = `Failed to load logs: ${e.message}`;
    return () => {};
  }

  if (logsData.logs.length === 0) {
    codeEl.textContent = "No log entries yet.";
  } else {
    const lines = logsData.logs.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      return `[${time}] ${entry.line}`;
    });

    codeEl.textContent = lines.join("\n");
  }

  logBox.scrollTop = logBox.scrollHeight;

  const channel = window.__ignis.ws.channel(CHANNEL);
  let unsubLog = null;

  const onLog = (msg) => {
    const payload = msg.payload || {};

    if (payload.vaultId !== vaultId) {
      return;
    }

    const time = new Date().toLocaleTimeString();
    const line = `[${time}] ${payload.line}`;

    if (codeEl.textContent === "No log entries yet.") {
      codeEl.textContent = line;
    } else {
      codeEl.textContent += "\n" + line;
    }

    const isNearBottom =
      logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 50;

    if (isNearBottom) {
      logBox.scrollTop = logBox.scrollHeight;
    }
  };

  details.addEventListener("toggle", () => {
    if (details.open) {
      if (!unsubLog) {
        unsubLog = channel.subscribe("sync-log", onLog);
      }
    } else if (unsubLog) {
      unsubLog();
      unsubLog = null;
    }
  });

  return () => {
    if (unsubLog) {
      unsubLog();
      unsubLog = null;
    }
  };
}

module.exports = { renderLogViewer };

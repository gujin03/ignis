const { Setting, Notice } = require("obsidian");
const api = require("./api");
const auth = require("./auth");

function renderAuthSection(tab, serverStatus) {
  tab._authEl.empty();

  const localToken = auth.getObsidianSyncToken();

  if (serverStatus.authenticated) {
    new Setting(tab._authEl)
      .setName("Obsidian Sync account")
      .setDesc(
        `Signed in as ${serverStatus.name || "unknown"} (${serverStatus.email || "unknown"})`,
      )
      .addButton((btn) => {
        btn.setButtonText("Disconnect");
        btn.buttonEl.addClass("mod-destructive");
        btn.onClick(async () => {
          try {
            await api.logout();
            new Notice("Disconnected from Headless Sync");
            const status = await api.getStatus();
            renderAuthSection(tab, status);
            await tab.renderSyncSection(status.authenticated);
          } catch (e) {
            new Notice(`Failed to disconnect: ${e.message}`);
          }
        });
      });
  } else if (localToken) {
    new Setting(tab._authEl)
      .setName("Obsidian Sync account detected")
      .setDesc(`${localToken.name} (${localToken.email})`)
      .addButton((btn) => {
        btn
          .setButtonText("Use this account for Headless Sync")
          .setCta()
          .onClick(async () => {
            try {
              await auth.sendTokenToServer(localToken);
              new Notice("Connected to Headless Sync");
              const status = await api.getStatus();
              renderAuthSection(tab, status);
              await tab.renderSyncSection(status.authenticated);
            } catch (e) {
              new Notice(`Failed to connect: ${e.message}`);
            }
          });
      });
  } else {
    new Setting(tab._authEl)
      .setName("Obsidian Sync account")
      .setDesc("Sign in to your Obsidian account to enable sync.")
      .addButton((btn) => {
        btn.setButtonText("Log in to Obsidian Sync").onClick(() => {
          const triggered = auth.triggerLogin(tab.app);

          if (!triggered) {
            new Notice(
              "Could not open login dialog. Try logging in from Settings > General.",
            );
            return;
          }

          tab._cancelWait = auth.waitForLogin(async (token) => {
            tab._cancelWait = null;

            if (token) {
              new Notice(`Detected login: ${token.name}`);
              const status = await api.getStatus();
              renderAuthSection(tab, status);
              await tab.renderSyncSection(status.authenticated);
            }
          });
        });
      });
  }
}

module.exports = { renderAuthSection };

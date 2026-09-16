const api = require("./api");

function getObsidianSyncToken() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    try {
      const val = JSON.parse(localStorage.getItem(key));

      if (val?.token && val?.email && val?.name) {
        return val;
      }
    } catch {}
  }

  return null;
}

function triggerLogin(app) {
  const aboutTab = app.setting.settingTabs.find((t) => t.id === "about");

  if (!aboutTab || !aboutTab.accountSetting) {
    return false;
  }

  const loginBtn = aboutTab.accountSetting.controlEl.querySelector("button");

  if (!loginBtn) {
    return false;
  }

  loginBtn.click();
  return true;
}

async function sendTokenToServer(tokenData) {
  return api.login(tokenData.token, tokenData.email, tokenData.name);
}

function waitForLogin(callback, timeoutMs = 60000) {
  const interval = 2000;
  let elapsed = 0;

  const timer = setInterval(() => {
    elapsed += interval;

    const token = getObsidianSyncToken();

    if (token) {
      clearInterval(timer);
      callback(token);
      return;
    }

    if (elapsed >= timeoutMs) {
      clearInterval(timer);
      callback(null);
    }
  }, interval);

  return () => clearInterval(timer);
}

module.exports = {
  getObsidianSyncToken,
  triggerLogin,
  sendTokenToServer,
  waitForLogin,
};

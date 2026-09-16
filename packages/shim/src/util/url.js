// True when a request URL targets the page's own origin (so it can skip the cross-origin proxy).
function isSameOrigin(url) {
  if (
    !url ||
    (url.startsWith("/") && !url.startsWith("//")) ||
    url.startsWith("./") ||
    url.startsWith("../")
  ) {
    return true;
  }

  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return true;
  }
}

// Hosts the user marked safe to fetch directly from the browser, bypassing the proxy.
// Populated at boot from the server settings, matched by exact hostname (case-insensitive).
let directFetchHosts = new Set();

function setDirectFetchHosts(list) {
  directFetchHosts = new Set(
    (Array.isArray(list) ? list : [])
      .map((host) => String(host).trim().toLowerCase())
      .filter(Boolean),
  );
}

// True when a request URL's host is on the direct-fetch list.
// The browser fetches it itself (subject to CORS) instead of routing through the server proxy.
function isDirectFetchHost(url) {
  if (directFetchHosts.size === 0) {
    return false;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return directFetchHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export { isSameOrigin, setDirectFetchHosts, isDirectFetchHost };

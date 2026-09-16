// Override window.requestUrl to proxy external requests through our server, bypassing CORS.
// Obsidian sets window.requestUrl in app.js, so we override it after app.js loads.

import { isSameOrigin, isDirectFetchHost } from "./util/url.js";
import { proxyFetch } from "./util/proxy.js";

async function proxyRequestUrl(request) {
  if (typeof request === "string") {
    request = { url: request };
  }

  // Same-origin requests don't need the proxy, and allowlisted hosts are fetched directly.
  if (isSameOrigin(request.url) || isDirectFetchHost(request.url)) {
    const res = await fetch(request.url, {
      method: request.method || "GET",
      headers: request.headers || {},
      body: request.body,
    });

    const arrayBuf = await res.arrayBuffer();

    return makeResponse(
      request,
      res.status,
      Object.fromEntries(res.headers),
      arrayBuf,
    );
  }

  // Cross-origin: route through server proxy
  const result = await proxyFetch({
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  return makeResponse(request, result.status, result.headers, result.body);
}

function makeResponse(request, status, headers, arrayBuf) {
  const text = new TextDecoder().decode(arrayBuf);
  let json;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status, headers, arrayBuffer: arrayBuf, text, json };
}

export function installRequestUrlShim() {
  // Obsidian sets window.requestUrl in app.js. We override it once the page loads.
  // Use a getter so it intercepts even if app.js sets it later.
  Object.defineProperty(window, "requestUrl", {
    get() {
      return proxyRequestUrl;
    },
    // Swallow Obsidian's later assignment so the shim keeps serving its own requestUrl.
    set() {},
    configurable: true,
  });
}

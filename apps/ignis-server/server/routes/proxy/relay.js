const net = require("net");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const {
  addressAllowed,
  httpError,
  privateHostError,
  safeLookup,
} = require("./ssrf-guard");

const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function sameOrigin(a, b) {
  return a.protocol === b.protocol && a.host === b.host;
}

// Let the proxy handle the Content-Length and Transfer-Encoding headers itself.
function stripRequestFramingHeaders(headers) {
  const out = {};

  for (const [key, val] of Object.entries(headers)) {
    const lower = key.toLowerCase();

    if (lower === "content-length" || lower === "transfer-encoding") {
      continue;
    }

    out[key] = val;
  }

  return out;
}

function requestOnce(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const mod = targetUrl.protocol === "https:" ? https : http;
    const outHeaders = stripRequestFramingHeaders(headers);
    const hasBody = body != null && method !== "GET" && method !== "HEAD";

    if (hasBody) {
      // Set Content-Length from the exact bytes written.
      // Avoids rejection from upstreams that do not accept chunked uploads.
      outHeaders["Content-Length"] = Buffer.byteLength(body);
    }

    const req = mod.request(
      targetUrl,
      { method, headers: outHeaders, lookup: safeLookup },
      resolve,
    );

    req.on("error", reject);

    if (hasBody) {
      req.write(body);
    }

    req.end();
  });
}

// Follow redirects manually so every hop runs through safeLookup and is re-checked.
async function proxyRequest({ url, method, headers, body }) {
  let current = new URL(url);
  let currentMethod = method;
  let currentHeaders = headers;
  let currentBody = body;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw httpError(400, "Only http and https URLs are allowed");
    }

    // An IP-literal host skips DNS, so safeLookup never runs for it; check it here.
    if (net.isIP(current.hostname) && !addressAllowed(current.hostname)) {
      throw privateHostError(current.hostname);
    }

    const res = await requestOnce(
      current,
      currentMethod,
      currentHeaders,
      currentBody,
    );

    if (!REDIRECT_CODES.has(res.statusCode) || !res.headers.location) {
      return res;
    }

    res.resume();
    const next = new URL(res.headers.location, current);

    // The caller did not choose the redirect target, so credentials do not cross origins.
    if (!sameOrigin(current, next)) {
      currentHeaders = { ...currentHeaders };

      for (const key of Object.keys(currentHeaders)) {
        const lower = key.toLowerCase();

        if (lower === "authorization" || lower === "cookie") {
          delete currentHeaders[key];
        }
      }
    }

    // 301/302/303 turn a non-GET follow-up into a GET; 307/308 preserve method and body.
    if (res.statusCode !== 307 && res.statusCode !== 308) {
      if (currentMethod !== "GET" && currentMethod !== "HEAD") {
        currentMethod = "GET";
        currentBody = null;
      }
    }

    current = next;
  }

  throw httpError(508, "Too many redirects");
}

function readBody(res, maxBytes) {
  return new Promise((resolve, reject) => {
    const encoding = (res.headers["content-encoding"] || "").toLowerCase();
    let stream = res;
    let decompressor = null;

    if (encoding === "gzip" || encoding === "x-gzip") {
      decompressor = zlib.createGunzip();
    } else if (encoding === "deflate") {
      decompressor = zlib.createInflate();
    } else if (encoding === "br") {
      decompressor = zlib.createBrotliDecompress();
    }

    if (decompressor) {
      stream = res.pipe(decompressor);
    }

    const chunks = [];
    let total = 0;
    let settled = false;

    function fail(err) {
      if (settled) {
        return;
      }

      settled = true;
      res.destroy();

      if (decompressor) {
        decompressor.destroy();
      }

      reject(err);
    }

    stream.on("data", (chunk) => {
      total += chunk.length;

      if (total > maxBytes) {
        fail(httpError(413, "Upstream response too large"));
        return;
      }

      chunks.push(chunk);
    });

    stream.on("end", () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(Buffer.concat(chunks));
    });

    stream.on("error", (e) => fail(httpError(502, e.message)));
    res.on("error", (e) => fail(httpError(502, e.message)));
  });
}

async function relayOnce({ url, method, headers, body }) {
  const upstream = await proxyRequest({ url, method, headers, body });
  const declaredLength = Number(upstream.headers["content-length"]);

  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    upstream.destroy();
    return { tooLarge: true };
  }

  const respBody = await readBody(upstream, MAX_RESPONSE_BYTES);

  // Strip hop-by-hop and encoding headers; the body is already decompressed.
  const skipHeaders = new Set([
    "content-encoding",
    "transfer-encoding",
    "content-length",
    "connection",
  ]);
  const respHeaders = {};

  for (const [key, val] of Object.entries(upstream.headers)) {
    if (!skipHeaders.has(key.toLowerCase())) {
      respHeaders[key] = val;
    }
  }

  return {
    status: upstream.statusCode,
    headers: respHeaders,
    body: respBody.toString("base64"),
  };
}

module.exports = {
  relayOnce,
  proxyRequest,
  requestOnce,
  stripRequestFramingHeaders,
};

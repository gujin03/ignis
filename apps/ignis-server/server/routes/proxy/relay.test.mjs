import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import http from "node:http";

const require = createRequire(import.meta.url);
const { requestOnce, stripRequestFramingHeaders } = require("./relay.js");

describe("stripRequestFramingHeaders", () => {
  it("drops content-length and transfer-encoding case-insensitively", () => {
    const out = stripRequestFramingHeaders({
      "Content-Length": "5",
      "transfer-encoding": "chunked",
      "Content-Type": "text/plain",
      Authorization: "Bearer x",
    });

    expect(out).toEqual({
      "Content-Type": "text/plain",
      Authorization: "Bearer x",
    });
  });

  it("leaves headers untouched when no framing headers are present", () => {
    const headers = { "Content-Type": "application/json", "X-Custom": "1" };

    expect(stripRequestFramingHeaders(headers)).toEqual(headers);
  });
});

describe("requestOnce framing", () => {
  function startEcho() {
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const buf = Buffer.concat(chunks);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              declaredCL: req.headers["content-length"] ?? null,
              transferEncoding: req.headers["transfer-encoding"] ?? null,
              authorization: req.headers["authorization"] ?? null,
              bytesRead: buf.length,
              body: buf.toString("utf8"),
            }),
          );
        });
      });

      srv.listen(0, "127.0.0.1", () => resolve(srv));
    });
  }

  function readJson(res) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  it("writes the whole body despite a too-short caller Content-Length", async () => {
    const srv = await startEcho();

    try {
      const { port } = srv.address();
      const url = new URL(`http://127.0.0.1:${port}/`);
      const body = "héllo wörld \u{1F600}"; // 18 utf8 bytes, 14 string chars

      const res = await requestOnce(
        url,
        "PUT",
        { "Content-Length": String(body.length), "X-Keep": "1" },
        body,
      );

      const echoed = await readJson(res);

      expect(echoed.bytesRead).toBe(Buffer.byteLength(body, "utf8"));
      expect(echoed.body).toBe(body);
      expect(Number(echoed.declaredCL)).toBe(Buffer.byteLength(body, "utf8"));
      expect(echoed.transferEncoding).toBe(null);
    } finally {
      srv.close();
    }
  });

  it("preserves non-framing headers while replacing Content-Length", async () => {
    const srv = await startEcho();

    try {
      const { port } = srv.address();
      const url = new URL(`http://127.0.0.1:${port}/`);
      const body = Buffer.from([1, 2, 3, 4, 5, 6, 7]);

      const res = await requestOnce(
        url,
        "PUT",
        { "Content-Length": "999", Authorization: "Bearer tok" },
        body,
      );

      const echoed = await readJson(res);

      expect(echoed.bytesRead).toBe(body.length);
      expect(Number(echoed.declaredCL)).toBe(body.length);
      expect(echoed.transferEncoding).toBe(null);
      expect(echoed.authorization).toBe("Bearer tok");
    } finally {
      srv.close();
    }
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-demo-guard-"));
process.env.VAULT_ROOT = VAULT_ROOT;
process.env.DATA_ROOT = path.join(VAULT_ROOT, "data");
process.env.DEMO_MODE = "true";

const express = require("express");
const { COOKIE_NAME, sessions } = require("./demo-sessions");
const {
  inboundTranslator,
  vaultFilesTranslator,
} = require("./demo-middleware");
const { wireWebSocket } = require("./demo-ws");

const SESSION_ID = "0123456789abcdef01234567";

let server;
let base;

beforeAll(async () => {
  sessions.set(SESSION_ID, { lastActivity: Date.now(), vaults: new Set() });

  const app = express();
  app.use("/api/vault", inboundTranslator);
  app.get("/api/vault/list", (req, res) => {
    res.json({ session: req._demoSessionId, vault: req.query.vault });
  });
  app.use("/vault-files", vaultFilesTranslator);
  app.use("/vault-files", (req, res) => {
    res.json({ url: req.url });
  });

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server.close();
  sessions.clear();
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("demo inbound translator", () => {
  it("rejects a request with no session cookie", async () => {
    const res = await fetch(`${base}/api/vault/list?vault=Notes`);

    expect(res.status).toBe(401);
  });

  it("rejects a malformed session cookie", async () => {
    const res = await fetch(`${base}/api/vault/list?vault=Notes`, {
      headers: { cookie: `${COOKIE_NAME}=../../etc` },
    });

    expect(res.status).toBe(401);
  });

  it("translates the vault for a live session", async () => {
    const res = await fetch(`${base}/api/vault/list?vault=Notes`, {
      headers: { cookie: `${COOKIE_NAME}=${SESSION_ID}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      session: SESSION_ID,
      vault: `demo-${SESSION_ID}__Notes`,
    });
  });
});

describe("demo vault-files translator", () => {
  it("rejects a request with no session cookie", async () => {
    const res = await fetch(`${base}/vault-files/Notes/a.png`);

    expect(res.status).toBe(401);
  });

  it("rewrites the visible vault name to the session's storage name", async () => {
    const res = await fetch(`${base}/vault-files/Notes/img/a%20b.png`, {
      headers: { cookie: `${COOKIE_NAME}=${SESSION_ID}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: `/demo-${SESSION_ID}__Notes/img/a%20b.png`,
    });
  });

  it("passes the session's own storage name through", async () => {
    const res = await fetch(
      `${base}/vault-files/demo-${SESSION_ID}__Notes/a.png`,
      { headers: { cookie: `${COOKIE_NAME}=${SESSION_ID}` } },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: `/demo-${SESSION_ID}__Notes/a.png`,
    });
  });

  it("refuses another session's storage name", async () => {
    const res = await fetch(
      `${base}/vault-files/demo-ffffffffffffffffffffffff__Notes/a.png`,
      { headers: { cookie: `${COOKIE_NAME}=${SESSION_ID}` } },
    );

    expect(res.status).toBe(403);
  });
});

function upgrade(cookie, vault) {
  const httpServer = new EventEmitter();
  const seen = [];

  httpServer.on("upgrade", (req) => seen.push(req.url));
  wireWebSocket(httpServer);

  const socket = {
    writable: true,
    writes: [],
    destroyed: false,
    write(data) {
      this.writes.push(data);
    },
    destroy() {
      this.destroyed = true;
    },
  };

  const headers = cookie ? { cookie: `${COOKIE_NAME}=${cookie}` } : {};

  httpServer.emit("upgrade", { url: `/ws?vault=${vault}`, headers }, socket);

  return { seen, socket };
}

describe("demo websocket guard", () => {
  it("refuses an upgrade with no session cookie", () => {
    const { seen, socket } = upgrade(null, "Notes");

    expect(seen).toEqual([]);
    expect(socket.destroyed).toBe(true);
    expect(socket.writes[0]).toMatch(/^HTTP\/1.1 403/);
  });

  it("refuses an upgrade to another session's storage name", () => {
    const { seen, socket } = upgrade(
      SESSION_ID,
      "demo-ffffffffffffffffffffffff__Notes",
    );

    expect(seen).toEqual([]);
    expect(socket.destroyed).toBe(true);
  });

  it("translates the vault for a live session", () => {
    const { seen, socket } = upgrade(SESSION_ID, "Notes");

    expect(seen).toEqual([`/ws?vault=demo-${SESSION_ID}__Notes`]);
    expect(socket.destroyed).toBe(false);
  });
});

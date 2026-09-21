import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vault-route-"));
const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "vault-route-data-"));
process.env.VAULT_ROOT = VAULT_ROOT;
process.env.DATA_ROOT = DATA_ROOT;

const VAULT_ID = "v";
const RENAMED_ID = "w";
const OTHER_ID = "other";
const SETTINGS_FILE = path.join(DATA_ROOT, "server-settings.json");

const config = require("../config");
const settings = require("../settings");
const bootstrapCache = require("../cache");
const vaultRouter = require("./vault");
const { watcher } = require("@ignis/server-core");
const express = require("express");

let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/vault", vaultRouter);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });

  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await watcher._reset();

  if (server) {
    server.close();
  }

  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});

  for (const entry of fs.readdirSync(VAULT_ROOT)) {
    fs.rmSync(path.join(VAULT_ROOT, entry), { recursive: true, force: true });
  }

  fs.mkdirSync(path.join(VAULT_ROOT, VAULT_ID), { recursive: true });
  config.refreshVaults();
  settings.update({ trustedVaults: [] });
  fs.rmSync(SETTINGS_FILE, { force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rename = (vault, name) =>
  fetch(`${base}/api/vault/rename`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vault, name }),
  });

const remove = (vault) =>
  fetch(`${base}/api/vault/remove?vault=${encodeURIComponent(vault)}`, {
    method: "DELETE",
  });

const refresh = (vault) =>
  fetch(`${base}/api/vault/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ vault }),
  });

describe("manual refresh", () => {
  it("serves a refresh right after an ordinary crawl", async () => {
    await bootstrapCache.getOrBuild(VAULT_ID);

    expect((await refresh(VAULT_ID)).status).toBe(200);
  });

  it("refuses a second refresh within the cooldown", async () => {
    fs.mkdirSync(path.join(VAULT_ROOT, OTHER_ID), { recursive: true });
    config.refreshVaults();

    expect((await refresh(OTHER_ID)).status).toBe(200);
    expect((await refresh(OTHER_ID)).status).toBe(429);
  });
});

describe("trusted vaults through the vault routes", () => {
  it("reports trust on the vault info fallback", async () => {
    settings.update({ trustedVaults: [VAULT_ID] });

    const info = await (
      await fetch(`${base}/api/vault/info?vault=${VAULT_ID}`)
    ).json();

    expect(info.trustPlugins).toBe(true);
    expect(info.id).toBe(VAULT_ID);
  });

  it("moves a renamed vault's id and keeps the other ids in place", async () => {
    settings.update({ trustedVaults: [VAULT_ID, OTHER_ID] });

    const res = await rename(VAULT_ID, RENAMED_ID);

    expect(res.status).toBe(200);
    expect(settings.get("trustedVaults")).toEqual([RENAMED_ID, OTHER_ID]);
  });

  it("drops a removed vault's id and keeps the other ids in place", async () => {
    settings.update({ trustedVaults: [VAULT_ID, OTHER_ID] });

    const res = await remove(VAULT_ID);

    expect(res.status).toBe(200);
    expect(settings.get("trustedVaults")).toEqual([OTHER_ID]);
  });

  it("writes no settings file when an untrusted vault is renamed", async () => {
    const res = await rename(VAULT_ID, RENAMED_ID);

    expect(res.status).toBe(200);
    expect(fs.existsSync(SETTINGS_FILE)).toBe(false);
  });

  it("writes no settings file when an untrusted vault is removed", async () => {
    const res = await remove(VAULT_ID);

    expect(res.status).toBe(200);
    expect(fs.existsSync(SETTINGS_FILE)).toBe(false);
  });
});

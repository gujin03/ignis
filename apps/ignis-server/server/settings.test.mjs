import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const SETTINGS_ID = require.resolve("./settings.js");
const CONFIG_ID = require.resolve("./config.js");

const DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-settings-"));
const VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ignis-settings-v-"));
const SETTINGS_FILE = path.join(DATA_ROOT, "server-settings.json");

function loadSettings() {
  process.env.DATA_ROOT = DATA_ROOT;
  process.env.VAULT_ROOT = VAULT_ROOT;
  delete require.cache[SETTINGS_ID];
  delete require.cache[CONFIG_ID];

  return require("./settings.js");
}

beforeEach(() => {
  fs.rmSync(SETTINGS_FILE, { force: true });
  delete process.env.IGNORED_PATHS;
});

afterAll(() => {
  fs.rmSync(DATA_ROOT, { recursive: true, force: true });
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("ignoreRules", () => {
  it("persists an update and keeps serving it", () => {
    const settings = loadSettings();
    const rules = [{ name: "Only", patterns: ["@eaDir"] }];

    expect(settings.update({ ignoreRules: rules }).ignoreRules).toEqual(rules);
    expect(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"))).toMatchObject({
      ignoreRules: rules,
    });
    expect(settings.get("ignoreRules")).toEqual(rules);
  });
});

describe("resolveIgnoreLines", () => {
  it("flattens the rule sets' patterns in order", () => {
    const settings = loadSettings();

    settings.update({
      ignoreRules: [
        { name: "A", patterns: ["a1", "a2"] },
        { name: "B", patterns: ["b1"] },
      ],
    });

    expect(settings.resolveIgnoreLines()).toEqual(["a1", "a2", "b1"]);
  });

  it("appends the IGNORED_PATHS env lines after the rules' lines", () => {
    process.env.IGNORED_PATHS = " @eaDir , #recycle ";

    const settings = loadSettings();

    settings.update({ ignoreRules: [{ name: "A", patterns: [".git"] }] });

    expect(settings.resolveIgnoreLines()).toEqual([
      ".git",
      "@eaDir",
      "#recycle",
    ]);
  });

  it("skips a malformed rule entry rather than crashing", () => {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({
        ignoreRules: [
          { name: "ok", patterns: ["keep"] },
          null,
          { name: "no-patterns" },
          { name: "bad", patterns: ["good", 5] },
        ],
      }),
    );

    const reloaded = loadSettings();

    expect(reloaded.resolveIgnoreLines()).toEqual(["keep"]);
  });
});

describe("hand-edited settings file", () => {
  it("drops a value whose type does not match the default", () => {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.writeFileSync(
      SETTINGS_FILE,
      JSON.stringify({
        trustedVaults: "vault-a",
        proxyMode: 7,
        directFetchHosts: ["kept.example"],
      }),
    );

    const settings = loadSettings();

    expect(settings.get("trustedVaults")).toEqual([]);
    expect(settings.get("proxyMode")).toBe("any");
    expect(settings.get("directFetchHosts")).toEqual(["kept.example"]);
  });
});

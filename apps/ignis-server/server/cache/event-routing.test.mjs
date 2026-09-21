import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";

const require = createRequire(import.meta.url);

const VAULT_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "event-routing-test-"),
);
process.env.VAULT_ROOT = VAULT_ROOT;

const VAULT_ID = "v";
const vaultDir = path.join(VAULT_ROOT, VAULT_ID);
fs.mkdirSync(vaultDir, { recursive: true });

const config = require("../config");
config.refreshVaults();
const bootstrapCache = require("./index");
const { createMetadataChannel } = require("./metadata-channel");
const { registerCacheListeners } = require("./listeners");
const { watcher, writeCoalescer } = require("@ignis/server-core");

const REVISION_DEBOUNCE_MS = 250;
const EVENT_TIMEOUT_MS = 8000;
const CASE_TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seed = (relPath, content) =>
  fs.writeFileSync(path.join(vaultDir, relPath), content);

let sent = [];

const wss = {
  channel: (name) => ({
    broadcastToVault(vaultId, message) {
      sent.push({ channel: name, vaultId, ...message });
    },
  }),
};

const metadataChannel = createMetadataChannel(wss);

registerCacheListeners({
  bootstrapCache,
  metadataChannel,
  watcher,
  writeCoalescer,
});

watcher.onWatcherStart((vaultId) =>
  bootstrapCache.markForRevalidation(vaultId),
);

const seen = [];

watcher.addGlobalListener((vaultId, event) => seen.push(event));

// wait for watcher event and queue
async function nextApply() {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;

  while (seen.length === 0) {
    if (Date.now() > deadline) {
      throw new Error("no watcher event arrived");
    }

    await sleep(50);
  }

  seen.length = 0;

  return bootstrapCache.applyMutation(VAULT_ID, []);
}

beforeAll(async () => {
  const ready = new Promise((resolve) => watcher.onWatcherStart(resolve));

  watcher.startWatching(VAULT_ID, vaultDir);

  await ready;
}, CASE_TIMEOUT_MS);

beforeEach(async () => {
  seen.length = 0;
  await sleep(REVISION_DEBOUNCE_MS + 50); // let any pending announcements finish
  sent = [];
});

afterAll(async () => {
  await watcher._reset();
  fs.rmSync(VAULT_ROOT, { recursive: true, force: true });
});

describe("watcher events routed into the apply engine", () => {
  it(
    "applies a created file to the stored entry instead of discarding it",
    async () => {
      const before = await bootstrapCache.getOrBuild(VAULT_ID);
      const beforeEtag = before.etag;

      seed("routed.md", "routed");

      const etag = await nextApply();
      const after = await bootstrapCache.getOrBuild(VAULT_ID);

      expect(after).toBe(before);
      expect(after.response.tree["routed.md"]).toMatchObject({ type: "file" });
      expect(etag).toBe(after.etag);
      expect(etag).not.toBe(beforeEtag);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "announces the revision the event produced",
    async () => {
      await bootstrapCache.getOrBuild(VAULT_ID);

      sent = [];
      seed("announced.md", "announced");

      const etag = await nextApply();
      await sleep(REVISION_DEBOUNCE_MS + 100);

      expect(sent).toEqual([
        {
          channel: "metadata",
          vaultId: VAULT_ID,
          type: "revision",
          etag,
        },
      ]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "says nothing for an event that reached no entry",
    async () => {
      await bootstrapCache.getOrBuild(VAULT_ID);
      bootstrapCache.invalidateVault(VAULT_ID);

      sent = [];
      seed("unheld.md", "unheld");

      const etag = await nextApply();
      await sleep(REVISION_DEBOUNCE_MS + 100);

      expect(etag).toBeNull();
      expect(sent).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );
});

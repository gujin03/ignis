---
title: Server plugins
description: Ignis plugins that run on the server.
---

Server plugins are Ignis's own plugins that run on the server, separate from Obsidian's community plugins. You enable them per vault from the **Ignis Core Plugins** tab in Obsidian's settings.

## Headless Sync

While Ignis supports the Obsidian Sync core plugin, that plugin can only run when Obsidian is loaded in a browser tab, so it stops syncing once you close the tab. Headless Sync runs the same Obsidian Sync on the server instead, through the `obsidian-headless` CLI, so a vault keeps syncing even without a browser tab open.

Enable it for a vault in the Ignis -> Core Plugins tab, then sign in with your Obsidian Sync account and link the vault from its settings tab. Headless Sync will continuously sync your vault in the background, resuming on container restart.

### Sync settings

Headless sync shares most settings with the official Sync plugin (it uses the official headless sync cli in the background). In the Settings tab, under "Ignis Core Plugins" heading; you can configure which remote vault to sync with, the sync mode, what types of files or settings you want to sync, manage excluded folders, and see the log from the sync process. For details on how these settings work, see the official Obsidian help for [Sync settings and selective syncing](https://obsidian.md/help/sync/settings) and for the [Headless Sync CLI](https://obsidian.md/help/sync/headless).

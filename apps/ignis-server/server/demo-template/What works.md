# What works

Most of Obsidian's features work in Ignis. Some have gaps or workarounds, and Ignis also adds things that make sense for running Obsidian in a browser.

## Obsidian features that work

- All core editor features: markdown, canvas, bases, and the command palette.
- Context menus throughout the UI.
- Image rendering, inline image URLs, and image paste from the clipboard.
- Print to PDF, via a hidden popup iframe.
- Mobile UI auto-activates when the window is under 600 px wide.
- Themes and CSS snippets.
- Most community plugins built on Obsidian's plugin API.
- Cross-origin plugin requests via `requestUrl` and `fetch`, proxied through the server.
- Obsidian Sync, in self-hosted deployments with a logged-in browser tab open.

## What doesn't work

- Plugins that depend on Node native modules or `child_process` won't load.
- Streaming `zlib` classes (`createGzip`, `createDeflate`, etc.) aren't implemented. The synchronous and callback variants work via `pako`.
- The synchronous file picker (`dialog.showOpenDialogSync`), used by plugins like Importer, has a staged-files workaround: the shim asks you to pick once and serves the result on retry. Usable but rough.
- `safeStorage` is passthrough by design: `isEncryptionAvailable()` returns `false` and `encrypt`/`decrypt` are no-ops, so anything plugins store via `safeStorage` ends up as plaintext on disk. A server-side encrypted option is planned but not yet implemented.

## What Ignis adds

### Vaults
- Custom UI for Obsidian's multi-vault support. Create, open, switch, rename, and delete vaults.
- Different vaults can be loaded in different browser tabs.

### Files
- File upload from the local machine: ribbon icon, right-click on a folder -> Upload file, or drag-and-drop into the UI.
- File and folder download: right-click any note for **Download**, or any folder for **Download as ZIP**.

### Multi-tab and workspaces
- Live file sync between browser tabs via WebSocket. Open the same vault in two tabs and edits propagate within a second.
- Saved workspaces opened in separate browser tabs via a `?workspace=` URL parameter, so each tab can hold a different layout of the same vault.
- An "Open workspace in tab" command added to the command palette by the bridge plugin.

### Sync
- Obsidian Headless is implemented as a server-side plugin for continuous sync without needing an active browser tab. Only one of Obsidian Sync or Obsidian Headless can run per vault.

### Server integration
- Server-side plugin system, separate from Obsidian's community plugin system. (WIP)
- Ignis-specific settings shown as their own tabs inside Obsidian's Settings modal.
- Status bar indicators for server state and headless sync activity.

## Performance note

- Pre-compressed bootstrap response covering vault info, vault list, metadata tree, and plugin list.
- Indexer pre-fetch warms the content cache so Obsidian's startup index hits cache instead of the network.
- LRU content cache (50 MB by default) so Ignis doesn't hold the whole vault in memory at once. Memory use stays bounded regardless of vault size.
- Write coalescing for slow filesystems (rclone, FUSE, NFS, SMB).

const SYNC_MODES = [
  { key: "bidirectional", name: "Bidirectional" },
  { key: "pull-only", name: "Pull only (remote to server)" },
  { key: "mirror-remote", name: "Mirror remote (exact copy)" },
];

const FILE_TYPES = [
  {
    key: "image",
    name: "Sync images",
    desc: "Sync image files with these extensions: bmp, png, jpg, jpeg, gif, svg, webp, avif.",
  },
  {
    key: "audio",
    name: "Sync audio",
    desc: "Sync audio files with these extensions: mp3, wav, m4a, 3gp, flac, ogg, oga, opus.",
  },
  {
    key: "video",
    name: "Sync videos",
    desc: "Sync video files with these extensions: mp4, webm, ogv, mov, mkv.",
  },
  {
    key: "pdf",
    name: "Sync PDFs",
    desc: "Sync PDF files.",
  },
  {
    key: "unsupported",
    name: "Sync all other types",
    desc: "Sync files of every other type. Markdown, canvas and base files always sync.",
  },
];

const CONFIG_CATEGORIES = [
  {
    key: "app",
    name: "Main settings",
    desc: "Sync editor, files and links, and other main settings.",
  },
  {
    key: "appearance",
    name: "Appearance settings",
    desc: "Sync appearance settings such as theme choice, dark mode and enabled snippets.",
  },
  {
    key: "appearance-data",
    name: "Themes and snippets",
    desc: "Sync installed themes and CSS snippets.",
  },
  {
    key: "hotkey",
    name: "Hotkeys",
    desc: "Sync custom hotkeys.",
  },
  {
    key: "core-plugin",
    name: "Active core plugin list",
    desc: "Sync which core plugins are enabled.",
  },
  {
    key: "core-plugin-data",
    name: "Core plugin settings",
    desc: "Sync the settings of core plugins.",
  },
  {
    key: "community-plugin",
    name: "Active community plugin list",
    desc: "Sync which community plugins are enabled.",
  },
  {
    key: "community-plugin-data",
    name: "Installed community plugins",
    desc: "Sync installed community plugins and their settings.",
  },
];

function keysOf(options) {
  return options.map((option) => option.key);
}

module.exports = { SYNC_MODES, FILE_TYPES, CONFIG_CATEGORIES, keysOf };

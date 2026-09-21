---
title: Performance
description: Reduce the load a large vault puts on the server.
---

Large vaults and plugin-heavy vaults may suffer some performance issues. These issues can be alleviated in a few ways.

## Ignored paths

Specified paths that the server does not watch for changes and does not send any events for. This means that external changes to those files, or changes in a different tab, are not observed and so not conveyed to clients or open tabs. These paths still appear in the vault and can be refreshed using `Refresh vault from disk` in the command palette.

The rules for file watcher exclusion are defined as gitignore patterns in the Ignored paths setting under Advanced in the Ignis settings tab. You can add your own patterns manually, or if Ignis has detected a plugin with a lot of files it considers a potential performance problem, you can easily add the suggested paths to your exclusion list.

The built-in System rule set excludes `.git`, `.trash`, `node_modules`, `@eaDir`, and `#recycle`. If for some reason you want to watch for changes in any of these dirs, you can remove them from the exclusion list.

Each pattern is one gitignore rule matched against the vault-relative path. A bare name such as `@eaDir` matches at any depth, a leading `/` anchors the pattern to the vault root, `!` re-includes a path a different pattern excluded, and patterns using wildcards such as `*` and `**` also work. See the [gitignore documentation](https://git-scm.com/docs/gitignore) for the full syntax.

Rules can also be provided using an environment variable: [`IGNORED_PATHS`](/docs/server/environment/) (a comma-separated list).

```yaml
    environment:
      - IGNORED_PATHS=.obsidian/plugins/obsidian-icon-folder/icons
```

## See also

- [Network filesystems](/docs/server/deploy/#network-filesystems) covers the file-operation thread pool and raising the host's file-watch limit, for large vaults on network mounts.

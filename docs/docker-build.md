# 将 Ignis 打包为 linux/amd64 Docker 镜像

本文说明如何将当前工程源码打包为适用于 **linux/amd64** 平台的 Docker 镜像。

## 一、现状：已有打包设施

工程内置了完整的镜像构建工具链，开箱即用：

| 文件 | 作用 |
|---|---|
| `apps/ignis-server/Dockerfile` | 多阶段构建：build 阶段 esbuild 打包前端产物 → runtime 阶段精简镜像 |
| `apps/ignis-server/scripts/build-image.js` | 封装 buildx 流程，支持本机 load 与多架构 push |
| npm script `docker:build` | `node apps/ignis-server/scripts/build-image.js` |

**Dockerfile 关键点**（无架构专属依赖，linux/amd64 直接可用）：

- 基础镜像 `node:22-slim`（官方多架构镜像，含 amd64）
- 多阶段：build 阶段执行 `npm ci` + esbuild 产出 3 个 dist 产物；runtime 阶段仅 COPY 产物 + 服务端源码 + server-core
- 镜像**不包含 Obsidian**；首次运行由 `entrypoint.sh` 按 `OBSIDIAN_VERSION` 从 GitHub releases 下载并解包到 `/app/obsidian-app`
- 三个持久化 volume：`/vaults`（笔记）、`/app/data`（状态）、`/app/obsidian-app`（Obsidian 缓存）
- `PUID/PGID`（默认 1000）指定运行用户，`gosu` 切换

## 二、构建方案

### 方式 A：构建机为 linux/amd64（或有 Docker Desktop）

目标架构与构建机一致，直接构建并加载到本地镜像库：

```bash
# 构建并加载为 nobbe/ignis:dev（仅本机可用）
node apps/ignis-server/scripts/build-image.js

# 等价于：
# docker buildx build --builder ignis-builder -f apps/ignis-server/Dockerfile \
#   -t nobbe/ignis:dev --load .
```

### 方式 B：跨平台构建 linux/amd64（构建机非 amd64，或 CI）

用 **buildx + docker-container 驱动 + QEMU** 指定目标平台。构建脚本默认多架构：

```bash
# 1. 创建 buildx builder（脚本会自动创建，driver 需支持多架构）
docker buildx create --name ignis-builder --driver docker-container

# 2. 多架构（amd64 + arm64）构建并推送
node apps/ignis-server/scripts/build-image.js --push

# 3. 只构建单一平台 linux/amd64 并推送（手动 buildx）
docker buildx build --builder ignis-builder \
  --platform linux/amd64 \
  -f apps/ignis-server/Dockerfile \
  -t nobbe/ignis:0.8.10 \
  --push .
```

> `build-image.js` 的 `PLATFORMS = "linux/amd64,linux/arm64"`（第 14 行）；只打 amd64 时，可直接用上面的手动 buildx 命令，或临时修改该常量。

### 构建脚本参数

```
node build-image.js [--push] [--no-latest]
```

| 参数 | 行为 |
|---|---|
| （无） | 构建本机架构，load 为 `<image>:dev` |
| `--push` | 构建 `PLATFORMS` 多架构并推送 manifest list，tag 为 package.json 版本 + `latest` |
| `--no-latest` | 与 `--push` 同用，不移动 `latest` tag |

其他控制：

- `IGNIS_IMAGE` 环境变量：自定义镜像名（默认 `nobbe/ignis`）
- `ARG IGNIS_BUILD`：构建戳，注入 `build-info.json`（`0.8.10+<hash>`）
- 构建前会检查 `git status`，有未提交改动时警告镜像与源码不一致

## 三、验证清单

```bash
# 1. 构建
node apps/ignis-server/scripts/build-image.js

# 2. 确认架构为 amd64
docker image inspect nobbe/ignis:dev --format '{{.Architecture}}'   # 期望 amd64

# 3. 启动容器
docker run -d -p 8080:8080 \
  -v ignis-vaults:/vaults -v ignis-data:/app/data -v ignis-ob:/app/obsidian-app \
  nobbe/ignis:dev

# 4. 验证服务与 Obsidian 版本
curl http://localhost:8080/api/version
# 期望 {"version":"0.8.10","build":"<hash>","obsidianVersion":"1.13.7"}
```

## 四、CI 集成（GitHub Actions 推荐做法）

```yaml
name: build-image
on:
  push:
    tags: ["v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/setup-qemu-action@v3   # 打 arm64 需要；amd64 在 ubuntu 原生运行
      - uses: docker/login-action@v3        # 推送 registry 用
      - run: node apps/ignis-server/scripts/build-image.js --push
```

## 五、回滚与版本切换

- 镜像不含 Obsidian，`OBSIDIAN_VERSION` 环境变量可切换 Obsidian 版本（`entrypoint.sh` 通过 `.obsidian-version` stamp 检测版本变化自动重装）
- `OBSIDIAN_PACKAGE` 环境变量支持离线安装（`.deb` / `.asar.gz` / `.asar`），受限网络下免下载
- 回退旧镜像：`docker pull nobbe/ignis:<旧版本>` + 重新 `docker run` 即可

# SIMKeeper

**SIMKeeper — Self-hosted SIM & eSIM lifecycle manager**

`v0.1.0-alpha.1` 是 SIMKeeper 的第一个可运行骨架。

当前已包含：

- 首次部署创建管理员
- 登录 / 退出
- SQLite 数据持久化
- 本地 Session Secret
- Dashboard 基础框架
- `/api/health` 健康检查（含当前构建 revision）
- Docker 单容器运行
- GitHub Actions 自动构建 Docker 镜像
- GHCR 发布流程
- CI 自动认证流程 smoke test

号码、运营商、保号规则等核心业务功能将在后续 alpha 版本逐步加入。

## 推荐部署方式

```yaml
services:
  simkeeper:
    image: ghcr.io/aspeternity/simkeeper:latest
    container_name: simkeeper
    ports:
      - "3000:3000"
    environment:
      PUID: 1000
      PGID: 1000
      SIMKEEPER_COOKIE_SECURE: "false"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

创建目录并启动：

```bash
mkdir -p /opt/docker/SIMKeeper/data
cd /opt/docker/SIMKeeper
docker compose pull
docker compose up -d
```

访问：

```text
http://HOST:3000
```

第一次访问 `/` 时，如果尚未初始化，会显示进入 `/setup` 的入口；创建管理员后即可进入 Dashboard。

## GitHub → GHCR 自动构建

仓库包含：

```text
.github/workflows/docker-publish.yml
```

每次 push 到 `main` 后，GitHub Actions 会先构建本地测试镜像并自动执行以下认证链路：

```text
/setup
→ 创建管理员
→ Dashboard
→ 退出
→ 登录
→ Dashboard
```

只有 smoke test 通过后，才会发布经过验证的 `linux/amd64` 镜像到 GHCR。alpha 开发阶段优先保证 x86_64 部署与迭代速度；ARM64 会在功能稳定后改为独立构建任务，避免 QEMU 编译 `better-sqlite3` 拖慢每次提交。

工作流同时启用了 concurrency；有新提交时会取消同分支旧构建，避免旧提交晚完成后覆盖 `latest`。

默认镜像：

```text
ghcr.io/aspeternity/simkeeper:latest
```

另有 commit SHA 标签用于定位和回滚。

## 检查当前运行版本

```bash
curl http://HOST:3000/api/health
```

示例：

```json
{
  "status": "ok",
  "database": "connected",
  "version": "0.1.0-alpha.1",
  "revision": "<git-commit-sha>"
}
```

## 数据目录

持久化数据位于：

```text
./data/simkeeper.db
./data/.session-secret
./data/backups/
```

更新容器不会删除这些数据。

## 更新 SIMKeeper

```bash
cd /opt/docker/SIMKeeper
docker compose pull
docker compose up -d --force-recreate
```

## 当前版本边界

### 已完成

- [x] 项目骨架
- [x] SQLite
- [x] 管理员初始化
- [x] 登录 Session
- [x] Dashboard Shell
- [x] Docker
- [x] Healthcheck
- [x] GitHub Actions
- [x] GHCR 自动发布
- [x] Auth smoke test

### 下一阶段 `v0.1.0-alpha.2`

- [ ] 运营商 CRUD
- [ ] SIM / eSIM CRUD
- [ ] E.164 号码规范化
- [ ] 国家/地区与货币字段
- [ ] Dashboard 真实统计数据

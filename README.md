# SIMKeeper

**SIMKeeper — Self-hosted SIM & eSIM lifecycle manager**

`v0.1.0-alpha.1` 是 SIMKeeper 的第一个可运行骨架。

当前已包含：

- 首次部署创建管理员
- 登录 / 退出
- SQLite 数据持久化
- 自动生成本地 Session Secret
- Dashboard 基础框架
- `/api/health` 健康检查
- Docker 单容器运行
- GitHub Actions 自动构建 Docker 镜像
- GHCR 发布流程

号码、运营商、保号规则等核心业务功能将在后续 alpha 版本逐步加入。

## 推荐部署方式

正式使用建议直接拉取 GitHub Container Registry 中的镜像，而不是在服务器本地编译。

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
```

将仓库里的 `compose.yml` 保存到该目录后：

```bash
docker compose pull
docker compose up -d
```

访问：

```text
http://HOST:3000
```

第一次访问会自动进入 `/setup` 创建管理员账户。

## GitHub → GHCR 自动构建

仓库已经包含：

```text
.github/workflows/docker-publish.yml
```

每次 push 到 `main` 后，GitHub Actions 会自动：

1. Checkout 源码
2. 初始化 Docker Buildx
3. 使用 `GITHUB_TOKEN` 登录 GHCR
4. 构建 `linux/amd64` 与 `linux/arm64`
5. 发布镜像

默认镜像：

```text
ghcr.io/<github-user>/simkeeper:latest
```

另外会生成当前 commit 对应的 `sha-*` 标签。

创建 Git Tag，例如：

```bash
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

还会生成：

```text
ghcr.io/<github-user>/simkeeper:v0.1.0-alpha.1
```

## 第一次发布后设置 GHCR 为 Public

GitHub 新创建的 Container package 可能默认是 Private。

第一次 Actions 构建成功后，在 GitHub 中进入：

```text
Profile
→ Packages
→ simkeeper
→ Package settings
→ Change visibility
→ Public
```

设为 Public 后，Docker 服务器无需登录 GitHub 即可直接：

```bash
docker compose pull
```

如果保留 Private，则需要先在服务器执行 `docker login ghcr.io`。

## 本地开发

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 本地 Docker Build

仓库保留了 `compose.build.yml`，用于开发阶段本地构建：

```bash
docker compose -f compose.build.yml up -d --build
```

正式部署推荐使用普通 `compose.yml` 直接拉 GHCR 镜像。

## 数据目录

持久化数据位于：

```text
./data/simkeeper.db
./data/.session-secret
./data/backups/
```

更新容器不会删除这些数据。

## 更新 SIMKeeper

以后更新只需要：

```bash
cd /opt/docker/SIMKeeper
docker compose pull
docker compose up -d
```

清理旧镜像可选：

```bash
docker image prune -f
```

## 健康检查

```text
GET /api/health
```

正常返回：

```json
{
  "status": "ok",
  "database": "connected",
  "version": "0.1.0-alpha.1"
}
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

### 下一阶段 `v0.1.0-alpha.2`

- [ ] 运营商 CRUD
- [ ] SIM / eSIM CRUD
- [ ] E.164 号码规范化
- [ ] 国家/地区与货币字段
- [ ] Dashboard 真实统计数据

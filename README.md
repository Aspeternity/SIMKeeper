# SIMKeeper

**SIMKeeper — Self-hosted SIM & eSIM lifecycle manager**

当前版本：`v0.1.0-alpha.9`

当前已包含：

- 运营商及 SIM / eSIM 号码管理，号码自动规范化为 E.164
- 实名状态、证件资料、余额、有效期和完整资费档案
- 多条独立保号规则、最低充值金额要求和保号活动记录
- 充值后余额与运营商有效期同步更新
- 号码绑定服务及关键账号依赖管理
- Dashboard 与提醒中心统一生命周期计算
- Telegram、Bark、Gotify 和 Webhook 通知渠道
- 每日精确通知时间、提醒里程碑、渠道筛选和自定义通知模板
- 完整 JSON 导出、本地备份、恢复前安全备份及保留策略
- 桌面与手机端响应式导航、页面标题和实时提醒数量
- SQLite 持久化、管理员登录、本地 Session Secret 和健康检查
- Docker 单容器运行及 GitHub Actions 验证后自动发布 GHCR 镜像

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

每次 push 到 `main` 后，GitHub Actions 会先构建本地测试镜像并自动执行完整核心流程：

```text
/setup
→ 创建管理员
→ Dashboard
→ 退出
→ 登录
→ 运营商 / 号码 / 资费 / 保号 / 绑定服务
→ 提醒与导航
→ 完整备份及恢复
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
  "version": "0.1.0-alpha.9",
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

## 当前 Alpha 能力

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
- [x] 运营商 CRUD
- [x] SIM / eSIM CRUD 与 E.164 规范化
- [x] 实名资料与资费档案
- [x] 保号规则、活动历史与充值要求
- [x] 绑定服务
- [x] 提醒中心与外部通知
- [x] 完整备份与恢复
- [x] 桌面 / 手机端响应式导航
- [x] 核心流程与功能专项 smoke test

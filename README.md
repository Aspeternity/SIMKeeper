# SIMKeeper

**SIMKeeper — Self-hosted SIM & eSIM lifecycle manager**

当前版本：`v0.1.0-alpha.21`

当前已包含：

- 运营商及 SIM / eSIM 号码管理，号码自动规范化为 E.164
- 运营商自动同步框架：一个连接可关联多张 SIM，支持 Provider 适配器、AES-256-GCM 凭据加密、手动/定时同步、余额/余额有效期/账户状态标准化、数据新鲜度判断和历史快照
- 首个真实运营商适配器 `DITO MyDITO（实验）`：从用户已经登录的 `my.dito.ph` 会话中导入真实余额 JSON 请求，支持 GET/POST、号码模板、可配置 JSON 路径和加密鉴权请求头；只允许访问 HTTPS 的 `dito.ph` 官方域名，不跟随重定向，不硬编码未经确认的私有 API
- 模拟 Provider 继续保留，用于离线验证连接、调度、加密、快照和错误恢复流程
- 自动同步结果独立保存，不会覆盖号码中手工维护的余额与号码有效期；删除连接后最近同步快照仍作为已过期历史数据保留
- 设备管理与号码存放位置：设备卡片、号码下拉分配、未分配状态、按位置筛选；删除设备会安全释放其中号码至“未分配”
- 安全删除号码：如仍有“当前绑定”服务，必须逐项选择“迁移绑定”或“删除绑定”；全部处理完成后才允许删除，迁移、解绑与号码删除在同一事务中完成
- 删除号码时可选保留只读号码概要快照；概要仅保留号码身份、删除时余额/有效期、资费名称、实名概要、绑定处理结果和备注，不保留 eSIM 凭据、完整证件号码、设备位置或生命周期明细
- eSIM 激活凭据归档：SM-DP+、Activation Code、Confirmation Code、LPA 字符串、配置状态、来源与重复激活策略
- eSIM 二维码在浏览器本地自动解析，并可按已保存的 LPA 信息重新生成二维码；原始二维码可选加密保留
- eSIM 激活凭据使用独立密钥 AES-256-GCM 加密后写入 SQLite，普通号码列表接口只返回是否已归档等摘要信息
- 实名状态、证件资料、余额、有效期和完整资费档案
- 多条独立保号规则、最低充值金额要求和保号活动记录
- 充值后余额与运营商有效期同步更新
- 号码绑定服务及关键账号依赖管理
- Dashboard、处理中心与通知渠道统一生命周期计算
- `保号规则` 只负责定义每张卡的维护方式、周期、日期来源和提醒窗口，不再承担实际活动录入
- `处理中心` 统一完成真实充值、短信、续期等生命周期任务，并支持在尚未进入提醒窗口时主动记录活动
- 右上角铃铛中的具体提醒直接定位到处理中心对应任务；处理中心与处理历史点击号码信息行直接打开与号码管理一致的详情弹窗
- `立即处理` 必须记录真实生命周期活动并推动有效期或下一次保号日期；不能通过一键隐藏风险来代替真实处理
- `稍后提醒 / 忽略本轮` 只影响处理中心、铃铛与外部通知，保号规则页仍显示真实生命周期状态和提醒暂缓状态
- 处理历史支持手动删除；删除暂缓/忽略记录会重新计算当前提醒，删除已完成核验记录不会回滚真实生命周期数据
- 顶部铃铛会在处理中心状态变化后主动刷新，并通过焦点恢复、页面切换与低频同步保持最新状态
- 旧版未核验的“已处理”记录不会继续压制提醒
- Telegram、Bark、Gotify 和 Webhook 通知渠道
- 每日精确通知时间、提醒里程碑、渠道筛选和自定义通知模板
- 完整 JSON 导出、本地备份、恢复前安全备份及保留策略；设备、删除概要、eSIM 凭据、运营商连接和同步快照均可随可移植备份跨实例恢复
- 桌面与手机端响应式导航、页面标题、实时提醒数量和右上角提醒概览
- SQLite 持久化、管理员登录、本地 Session Secret 和健康检查；健康接口版本号直接读取 `package.json`，避免发布版本与健康检查不一致
- Docker 单容器运行及 GitHub Actions 验证后自动发布 GHCR 镜像

## DITO MyDITO（实验）连接

DITO 当前没有公开、稳定、面向第三方的账户余额 API。SIMKeeper 因此不会猜测并硬编码未知私有接口，而是复用你本人已经登录的 MyDITO 会话请求：

1. 浏览器打开 `https://my.dito.ph` 并正常登录。
2. F12 → Network，刷新账户首页，找到返回实时 Load Balance 的 JSON 请求。
3. 在 SIMKeeper `设置与备份 → 运营商连接` 添加 `DITO MyDITO（实验）`。
4. 填入该请求最终的 Request URL；把 Authorization、Cookie、x-* 等鉴权相关 Header 整理为 JSON 放入“加密凭据”。
5. 首次可以让余额/币种/余额有效期/账户状态 JSON 路径保持空白，SIMKeeper 会尝试识别常见字段；如果无法识别，再按真实响应填写类似 `data.balance` 的路径。
6. 保存后执行“立即同步”。若以后出现 401/403，只需重新登录 MyDITO 并更新鉴权请求头。

安全限制：DITO Provider 只允许请求 `https://dito.ph` 及其子域名、只允许标准 HTTPS 端口、禁止在 URL 中嵌入账号密码、禁止 Host/Content-Length 等危险请求头、禁止自动跟随重定向，并限制响应大小和请求超时。MyDITO Token/Cookie 不会通过普通连接 API 回显。

可用模板：`{{phoneNumber}}`、`{{e164}}`、`{{msisdn}}`、`{{localNumber}}`、`{{simLabel}}`。因此一个 DITO 连接仍可在接口结构允许时服务多张 DITO SIM。

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
→ 运营商 / 号码 / 设备 / 资费 / 保号规则 / 绑定服务
→ 处理中心 / 提醒 / 导航
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
  "version": "0.1.0-alpha.21",
  "revision": "<git-commit-sha>"
}
```

## 数据目录

持久化数据位于：

```text
./data/simkeeper.db
./data/.session-secret
./data/.credential-secret
./data/backups/
```

`.credential-secret` 用于解密本实例保存的 eSIM 激活凭据和运营商连接凭据，不应单独删除。SIMKeeper 的可移植 JSON 备份会携带跨实例恢复所需的凭据密钥，因此备份文件本身也属于高敏感数据，请按密码文件同等级别妥善保管。

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
- [x] 运营商连接与自动同步框架（加密凭据、调度、快照、数据新鲜度）
- [x] Mock Provider
- [x] DITO MyDITO 实验 Provider（会话请求导入、HTTPS/域名限制、JSON 映射）
- [x] 设备管理与号码存放位置
- [x] 删除号码前绑定服务检查、迁移绑定与删除绑定
- [x] 删除号码时可选保留只读概要与独立删除记录
- [x] eSIM 加密激活凭据、二维码本地解析与二维码重新生成
- [x] 实名资料与资费档案
- [x] 保号规则、活动历史与充值要求
- [x] 绑定服务
- [x] 处理中心、真实处理闭环、主动活动记录、可删除处理历史与外部通知
- [x] 完整备份与恢复
- [x] 桌面 / 手机端响应式导航
- [x] 核心流程与功能专项 smoke test

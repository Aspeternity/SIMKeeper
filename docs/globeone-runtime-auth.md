# GlobeOne 运行时认证

SIMKeeper 的 GlobeOne Provider 需要一个 App 级授权值来向 GlobeOne 获取 App Access Token。这个值属于运行时机密，不应提交到 GitHub，也不会写入 SIMKeeper 的 SQLite 或便携备份。

## 推荐方式：只读 secret 文件

在 SIMKeeper 部署目录创建：

```text
./secrets/globeone_app_authorization
```

文件内容必须是一行完整的授权值，格式为：

```text
Basic <authorized-value>
```

仓库自带的 `compose.yml` 会把 `./secrets` 只读挂载到容器的 `/run/secrets`。SIMKeeper 默认读取：

```text
/run/secrets/globeone_app_authorization
```

建议设置文件权限：

```bash
chmod 600 ./secrets/globeone_app_authorization
```

然后重建容器：

```bash
docker compose up -d --force-recreate
```

## 兼容方式：环境变量

如果部署平台不方便挂载文件，也可以使用：

```text
GLOBEONE_APP_AUTHORIZATION=Basic <authorized-value>
```

文件方式优先推荐，因为环境变量可能通过容器配置检查工具被看到。

## 可选覆盖项

- `GLOBEONE_APP_AUTHORIZATION_FILE`：自定义 App Authorization 文件路径。
- `GLOBEONE_APP_ACCESS_TOKEN`：直接提供短期 App Access Token，仅用于调试。
- `GLOBEONE_APP_ACCESS_TOKEN_FILE`：从文件读取短期 App Access Token。
- `GLOBEONE_DEVICE_ID`：固定 DeviceId；留空时 SIMKeeper 会在 `data/.globeone-device-id` 自动生成并持久化随机 UUID。

## 安全边界

- SIMKeeper 不在公开仓库中内置第三方 App 的私有 OAuth 凭据。
- PIN 使用 SIMKeeper 凭据密钥加密保存。
- GlobeOne User Token 单独加密保存。
- OTP 不持久化。
- App 级授权值只从运行时环境或只读 secret 文件读取，不进入数据库和便携备份。

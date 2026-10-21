# 部署到 Vercel

推荐部署结构：Vercel 托管前端和短时 API，Turso libSQL 数据库存储玩家、对局、成绩、在线状态及限流计数。朋友访问同一个 Production 网站即可一起争榜，无需连接同一 Wi-Fi。

当前源码已包含 Vercel 适配。首次上线仍需你拥有一个 GitHub 仓库、一个 Vercel 项目和一个 Turso 数据库；项目不会自动创建账号或数据库，也没有内置任何凭据。

## 1. 准备数据库

创建 **兼容 `@libsql/client` 的 Turso libSQL 数据库**，取得：

| Vercel 环境变量                  | 是否必填 | 内容                                                       |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| `FLAPPY_BIRD_TURSO_DATABASE_URL` | 是       | `libsql://数据库名-组织名.turso.io` 或该数据库的 HTTPS URL |
| `FLAPPY_BIRD_TURSO_AUTH_TOKEN`   | 是       | 该数据库的有效读写 Token                                   |
| `LEADERBOARD_TIMEZONE`           | 否       | 推荐 `Asia/Shanghai`；未配置时今日排行也默认按此时区计算   |

可以从 [Vercel 的 Turso 集成](https://vercel.com/marketplace/tursocloud) 创建并连接数据库，或在 [Turso](https://turso.tech/) 创建后手动填写环境变量。平台注入的 `FLAPPY_BIRD_` 前缀已受支持，可以直接保留上述变量，无需重命名或额外复制。

排行榜时区默认是 `Asia/Shanghai`，无需额外设置。需要更改时请配置 `LEADERBOARD_TIMEZONE`；系统的 `TZ`（包括平台可能注入的 `:UTC`）不会参与排行榜时区校验或计算。

也兼容原来的 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` 整组变量。如果同时配置两组，优先使用带 `FLAPPY_BIRD_` 前缀的一组；该组只填写一项时会明确报错，不会混用另一组的 URL 或 Token。

本项目使用成熟的 libSQL 客户端；若 Turso 控制台提供多种数据库引擎，应选择与 `@libsql/client` 兼容的 libSQL 类型。不要把本地 SQLite 文件路径填写成云数据库地址。

首次调用时自动执行幂等建表语句，不需要另跑 SQL 迁移。Token 必须允许建表及读写，不能使用只读 Token。

凭据只放在 Vercel 服务端环境变量中。不要加 `VITE_` 前缀，不要提交 `.env`、Token 或本机 `data/` 目录。

## 2. 部署代码

本项目仓库：[lxzh/FlappyBird](https://github.com/lxzh/FlappyBird)。部署前将最新代码推送到该仓库的 `main` 分支。

### 一键部署按钮

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flxzh%2FFlappyBird&env=FLAPPY_BIRD_TURSO_DATABASE_URL%2CFLAPPY_BIRD_TURSO_AUTH_TOKEN&envDescription=%E5%85%88%E5%88%9B%E5%BB%BA+Turso+libSQL+%E6%95%B0%E6%8D%AE%E5%BA%93%EF%BC%8C%E5%A1%AB%E5%86%99%E8%BF%9E%E6%8E%A5+URL+%E5%92%8C%E8%AF%BB%E5%86%99+Token%E3%80%82%E5%87%AD%E6%8D%AE%E5%8F%AA%E7%94%A8%E4%BA%8E%E6%9C%8D%E5%8A%A1%E7%AB%AF%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2Flxzh%2FFlappyBird&project-name=flappy-bird&repository-name=flappy-bird)

点击按钮后，在 Vercel 中填写两个数据库环境变量并完成部署。

重新生成该仓库的部署按钮：

```sh
npm run deploy:link -- https://github.com/lxzh/FlappyBird
```

命令会输出可放进 README 的 **Deploy with Vercel** 按钮 Markdown，按钮链接会在 Vercel 部署流程中要求填写两个必需的 Turso 环境变量。地址必须指向真实且包含当前代码的仓库；公开仓库可使用标准 Deploy Button 克隆流程，私有仓库建议在 Vercel 直接 Import。

如果已经配置 `git remote origin`，可直接执行 `npm run deploy:link`。

### 在 Vercel 导入仓库

登录 Vercel，选择 **Add New → Project → Import Git Repository**。配置由仓库中的 `vercel.json` 提供：

| 设置                  | 值                                                     |
| --------------------- | ------------------------------------------------------ |
| Root Directory        | 仓库中本项目所在目录，若项目在仓库根部则保持默认       |
| Framework Preset      | Vite                                                   |
| Node.js               | 24.x（由 `package.json` 锁定主版本）                   |
| Install Command       | `npm ci`                                               |
| Build Command         | `npm run build:vercel`                                 |
| Output Directory      | `dist`                                                 |
| API                   | `api/game.ts`，所有现有 `/api/...` 接口由 rewrite 转发 |
| Function Max Duration | 15 秒；游戏在浏览器运行，不会占用一条长时函数调用      |

在部署页面填写数据库变量，至少勾选 **Production**，再 Deploy。构建时会检查必要变量是否缺失、数据库 URL 格式及排行榜时区；数据库连通性由上线后的健康检查确认。

不需要在 Vercel 配置 `npm start`、`PORT` 或 `DATABASE_PATH`。Vercel 使用 API 函数，不运行本地的常驻 HTTP 服务。修改环境变量后需要重新部署，旧部署不会自动使用新值。

## 3. 上线后验证

1. 打开 `https://你的生产域名/api/health`，应返回 `{"ok":true}`；该接口实际执行数据库查询。
2. 打开 `/api/info`，应包含 `"mode":"public"` 和 `"transport":"poll"`。
3. 用两个不同浏览器或两台设备打开网站，分别完成一局，确认成绩自动上传，另一台设备约 10 秒内更新排行。
4. 刷新页面、重新部署后，确认服务端成绩仍在。相同数据库即共享同一排行榜。
5. 用未登录 Vercel 的无痕窗口访问 **Production 域名**，确认朋友无需 Vercel 账号也能访问。检查项目的 Deployment Protection；受保护的 Preview 地址可能要求登录。

## 云端与本地的区别

| 项目     | 本地 / 局域网                             | Vercel 公网                                      |
| -------- | ----------------------------------------- | ------------------------------------------------ |
| 存储     | Node.js 内置 SQLite，`data/flappy.sqlite` | Turso libSQL，跨实例和重新部署持久保存           |
| 排行同步 | SSE 推送                                  | 页面可见时每 10 秒刷新；自己的成绩上传后主动刷新 |
| 在线人数 | SSE 连接，玩家 ID 去重                    | 数据库心跳，玩家 ID 去重，45 秒无活动后过期      |
| 邀请地址 | 本机局域网 IP                             | 当前网站域名                                     |
| 限流     | 本机内存计数                              | 数据库原子计数，所有函数实例共享                 |

Vercel 函数的本地文件不能用作持久数据库，写入 `/tmp` 也不能解决跨实例和重部署的数据保留。内存中的 SSE 客户端集合同样不能跨实例共享，所以云端使用短请求和数据库心跳。参见 [Vercel 运行时与文件系统说明](https://vercel.com/docs/functions/runtimes)。

## 部署时要注意

- **生产与预览数据库隔离。** 推荐 Production、Preview 使用不同数据库，避免测试成绩污染正式排行；如果不需要 Preview 联机，不要向 Preview 注入生产 Token。没有数据库变量的云端构建会明确失败。
- **数据库区域。** 在 Vercel 选择靠近数据库的函数区域，减少冷启动和 SQL 网络延迟。首次打开或首次开局可能比后续稍慢。
- **用量与 Token 有效期。** 云端刷新会消耗函数请求和数据库读写配额。隐藏标签页时会暂停轮询；仍应在两家控制台查看实际用量及 Token 到期时间，套餐额度以官方当前设置为准。
- **成绩不自动迁移。** 本机 `data/flappy.sqlite` 的历史成绩不会自动上传到新建的 Turso 数据库。浏览器待上传队列也属于各自域名，换成公网地址后不会自动读取 localhost 的队列。
- **匿名娱乐排行。** 每个浏览器保存匿名身份，清理站点数据或更换域名会创建新身份；暂无账号找回、私密房间或完整反作弊。适合和朋友分享挑战。

## 访问与运行时排查

构建成功后仍要检查 `/api/health` 和 `/api/info`：前者验证数据库连接，后者验证函数能启动。

- 如果日志是 `ERR_MODULE_NOT_FOUND`，并且编译后的 `api/game.js` 仍在导入 `server/app.ts`，请更新到启用了 `rewriteRelativeImportExtensions` 的版本后重新部署。Vercel 使用根目录的 `tsconfig.json` 编译函数，仅修改本地服务的 `tsconfig.server.json` 不会修复云端函数。
- 如果浏览器提示证书不匹配或域名打不开，可能是访问网络的 DNS / 路由问题，需要与 API 的 `500` 错误分别排查。Vercel 官方说明 `.vercel.app` 在中国大陆可能无法访问，建议为项目绑定自己的域名，再按控制台提示配置 DNS；自定义域名也无法保证所有网络均可访问。见 [Vercel 官方访问说明](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)。

## 常见问题

如果旧部署报“TZ 不是有效时区”，请更新到使用 `LEADERBOARD_TIMEZONE` 的修复版本后重新部署。默认北京时间无需设置任何时区变量；自定义排行榜时区时请使用 `LEADERBOARD_TIMEZONE=Asia/Shanghai` 等 IANA 名称。

| 现象                           | 检查                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| 构建提示缺少变量               | 在 Vercel 添加两个 Turso 变量，确认属于正确的环境，再 Redeploy                      |
| `/api/health` 返回 5xx         | 检查数据库 URL、Token 权限 / 有效期、数据库是否在线，查看 Function Logs             |
| 页面能打开但成绩只显示离线练习 | 先检查 `/api/health` 与 `/api/info`，确认 API 没有被错误路由成静态 HTML             |
| `/api/...` 返回 404            | 确认 Root Directory 正确，提交了 `api/game.ts` 和 `vercel.json`，并保留 API rewrite |
| 朋友看到 Vercel 登录页面       | 分享 Production 域名，检查 Deployment Protection 的访问设置                         |
| 关闭页面后在线人数未立即减少   | 云端在线状态最长约 45 秒后过期；显示值在下一次轮询时刷新                            |
| 服务器接受成绩但排名暂未变化   | 榜单按每位玩家最高分排序，其他客户端最多约 10 秒后刷新                              |

官方参考：[Vercel Deploy Button](https://vercel.com/docs/deploy-button)、[按钮环境变量](https://vercel.com/docs/deploy-button/environment-variables)、[Node.js 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference)。

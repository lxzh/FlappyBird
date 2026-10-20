# Flappy Bird · 在线街机

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Flxzh%2FFlappyBird&env=FLAPPY_BIRD_TURSO_DATABASE_URL%2CFLAPPY_BIRD_TURSO_AUTH_TOKEN&envDescription=%E5%85%88%E5%88%9B%E5%BB%BA+Turso+libSQL+%E6%95%B0%E6%8D%AE%E5%BA%93%EF%BC%8C%E5%A1%AB%E5%86%99%E8%BF%9E%E6%8E%A5+URL+%E5%92%8C%E8%AF%BB%E5%86%99+Token%E3%80%82%E5%87%AD%E6%8D%AE%E5%8F%AA%E7%94%A8%E4%BA%8E%E6%9C%8D%E5%8A%A1%E7%AB%AF%E3%80%82&envLink=https%3A%2F%2Fgithub.com%2Flxzh%2FFlappyBird&project-name=flappy-bird&repository-name=flappy-bird)

完整的 2D Flappy Bird 网页游戏：像素场景、物理碰撞、自动上传成绩、持久化记录，以及多人排行榜。支持本地 / 局域网和 Vercel 公网两种部署，玩家各自独立进行游戏并共享排行。

点击上方 **Deploy with Vercel**，填写 `FLAPPY_BIRD_TURSO_DATABASE_URL` 和 `FLAPPY_BIRD_TURSO_AUTH_TOKEN` 即可开始部署。同时兼容原来的 `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` 整组变量。完整步骤与注意事项见 [Vercel 部署说明](DEPLOYMENT.md)。

代码仓库：[lxzh/FlappyBird](https://github.com/lxzh/FlappyBird)。

## 启动

需要 **Node.js 24.x**。

```sh
npm ci
npm run build
npm start
```

本机打开 **http://localhost:3000**。服务绑定 `0.0.0.0`，终端会打印当前局域网地址，例如 `http://192.168.31.115:3000`。点击页面上的「邀请好友」即可复制房间链接。朋友连接相同 Wi-Fi 后，用电脑或手机浏览器访问该地址。

开发时运行：

```sh
npm run dev
```

前端热更新、API 和实时事件使用同一个端口，无需单独启动后端或配置跨域。

可配置环境变量：

```sh
PORT=8080 DATABASE_PATH=./data/flappy.sqlite LEADERBOARD_TIMEZONE=Asia/Shanghai npm start
```

- `PORT`：默认 `3000`。
- `DATABASE_PATH`：默认 `data/flappy.sqlite`，服务重启后成绩仍保留。
- `LEADERBOARD_TIMEZONE`：默认 `Asia/Shanghai`，用于今日排行的日期边界，独立于系统 `TZ`。
- 防火墙需要允许 Node.js 入站连接；访客网络或 AP 隔离可能阻止设备互访。
- 多网卡设备可在邀请窗口选择其他可用地址。这里只提供局域网访问，不依赖公网服务。

## 操作与功能

- 空格 / ↑ / 鼠标点击 / 触屏轻点：振翅。
- P / Esc / 工具栏按钮：暂停或继续。切换标签页时自动暂停。
- 每通过一组水管得 1 分；碰到水管、地面或天空边界结束。
- 支持重开、音效开关、全屏，以及 4 款小鸟配色。
- 点击右上角头像修改昵称。浏览器保存匿名玩家 ID、配色、音效偏好和个人纪录，不需要注册。
- 今日排行与历史最佳实时刷新，展示每位玩家的最高分。相同分数按首次达到该分数的时间排序。
- 在线人数按匿名玩家 ID 去重，同一域名、同一浏览器打开多个标签页只计一人。
- 每局结束自动上传；服务端按随机种子和操作轨迹重放，校验得分、碰撞结束状态与基本游戏时长。可防止直接篡改分数，不能替代面向公网竞技的完整反作弊系统。
- 已从服务器取得游戏编号的对局，即使断线也会把成绩放入浏览器持久队列，恢复连接后补传，重复上传不会重复计数。
- 完全离线开始的对局为练习模式，只保留本机统计，不进入服务端排行。
- 字体、图形和音效均在本地提供。运行时无需访问 CDN 或下载素材。

## 技术与依赖边界

| 职责     | 实现                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 页面     | React + TypeScript + Vite                                                              |
| 游戏     | Canvas 2D，固定 60 Hz 仿真，浏览器与服务端共享引擎                                     |
| 状态     | Zustand，持久化必要的本机数据                                                          |
| UI       | 本地可修改的 Button / Dialog 源码；弹窗基于 Radix Dialog，使用与 shadcn 相同的基础原语 |
| 图标     | 仅 Lucide React                                                                        |
| 动效     | CSS 与游戏 RAF，不引入额外动画框架                                                     |
| 服务     | 本地 Node.js 原生 HTTP / Vercel Functions                                              |
| 存储     | 本地 Node.js 内置 SQLite；云端 Turso libSQL                                            |
| 联机排行 | 本地 EventSource / SSE；Vercel 每 10 秒刷新，自动重连                                  |

仅引入实际使用的依赖。没有第二套 UI、图标、状态或动画库，也没有引入不需要的拖拽、面板布局库。`package-lock.json` 锁定完整依赖树。

原生 SQLite 在某些 Node.js 24 小版本可能打印实验性提示，不影响运行。使用该内置模块可以避免额外 SQLite 驱动及原生编译依赖。

## 目录

```text
src/
  App.tsx                 页面、排行、档案和邀请流程
  styles.css              统一设计样式和响应式布局
  store.ts                Zustand 状态与本机持久化
  api.ts                  实时连接、成绩队列补传
  game/useEngine.ts       帧循环、输入和游戏生命周期
  game/render.ts          像素场景和角色绘制
  game/audio.ts           Web Audio 合成音效
  components/ui/          可控的基础组件源码
shared/game.ts            确定性物理、碰撞、种子赛道与回放
server/app.ts             API、请求校验、限流、SSE
server/database.ts        SQLite 数据与排行查询
server/index.ts           本地同源开发 / 生产 HTTP 服务
server/remote-database.ts  Turso 云存储、跨实例在线状态和限流
api/game.ts               Vercel 函数入口
vercel.json               云端构建、API 路由及安全响应头
DEPLOYMENT.md             公网部署步骤与注意事项
public/fonts/             本地字体与 SIL Open Font License
tests/                    游戏与服务端集成测试
```

## 验证

```sh
npm test
npm run build
npm audit
npm run test:production
```

`test:production` 需要先构建，会启动隔离的生产服务，按真实时间完成两局飞行并验证重启持久化，不会向正常排行榜写入测试数据。

测试覆盖真实计分和确定性回放、地面 / 天空碰撞、非法成绩拒绝、昵称更新、个人最佳排行、重复提交、延迟补传、两个客户端实时接收排行、在线人数去重、SQLite 重启持久化、今日 / 历史分离、同分排序，以及云端适配器的多实例一致性、心跳过期、共享限流和时区边界。

云端适配测试使用本地隔离的 libSQL 数据库，不代表已验证你尚未配置的真实 Turso / Vercel 账号。

生产静态文件输出到 `dist/`，服务端输出到 `dist-server/`。停止服务后备份整个 `data/` 目录，即可保留服务端成绩。浏览器匿名 ID 存在本机，清理站点数据会创建新的玩家身份；昵称相同不代表同一账号。

字体：DM Sans、Space Grotesk，随附 OFL 许可证。场景与角色为代码绘制，无远程图片依赖。

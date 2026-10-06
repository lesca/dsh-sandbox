# dsh-docker-proxy

让局域网设备访问 `dsh web` 的零依赖 Node.js 代理。

`dsh` 出于安全考虑只监听 loopback（`127.0.0.1`），局域网设备无法直接访问；
而且 `dsh web` 启动时在控制台打印一次性 token（`dsh web: http://127.0.0.1:3080/?token=...`），
在 Docker 容器里用户很难拿到这个 token。本工具解决这两个问题：

1. 监听局域网可达的端口（默认 `0.0.0.0:13080`），把请求转发给 dsh 的服务端口（`--dsh-port`，默认 3080）；
2. 从 dsh 的控制台输出中自动抓取 token，当未登录的浏览器请求首页时，
   把它重定向到 `http://<你访问的主机>:<代理端口>/?token=xxx`，
   浏览器自动完成 token 换 cookie，无需接触容器控制台。

另外还解决了 dsh 客户端的一个限制：dsh 网页端按**页面自身的主机名**判断
"是否 loopback"，局域网 IP 会被判为否，于是设置页（模型/密钥等）整体不可用
（提示 "settings are unavailable in this browser"）、语言偏好无法持久化
（每次刷新回到英文）。代理在首页 HTML 中注入一行 dsh 官方的壳传输声明
（`__DSH_TRANSPORT__` 的 `ownsHost: true`），客户端据此把本会话视为
"页面拥有 Host"，与 loopback 访问获得完全一致的功能。

## 快速开始

要求：Node.js ≥ 18（无第三方依赖），容器内可执行 `dsh`。

```bash
# 从项目目录运行（package.json 与源码都在 src/ 下）
node src/index.js
```

启动日志：

```
[dsh-docker-proxy] starting: dsh web --port 3080 --no-open
dsh web: http://127.0.0.1:3080/?token=***
[dsh-docker-proxy] captured dsh launch token (length 43)
[dsh-docker-proxy] proxy listening on http://0.0.0.0:13080
[dsh-docker-proxy] forwarding to dsh on http://127.0.0.1:3080
```

局域网用户打开 `http://<宿主机IP>:13080/` 即可：未登录时自动跳转到 token 地址，
登录后（30 天会话 cookie）正常使用 UI、API 与 WebSocket 会话。

## 选项

```
--listen <port>     代理监听端口                    (默认 13080)
--listen-host <ip>  代理绑定地址                    (默认 0.0.0.0)
--dsh-port <port>   dsh web 服务端口                (默认 3080)
--dsh-host <ip>     dsh web 服务主机                (默认 127.0.0.1)
--dsh-cmd <cmd>     启动 dsh 使用的命令             (默认 "dsh")
--token <token>     显式提供 launch token（配合 --no-spawn）
--no-spawn          不启动 dsh，假定它已在 --dsh-port 上运行
-h, --help          显示帮助
```

示例：

```bash
# dsh 已单独运行在 3080，代理只提供端口 + token 重定向
node src/index.js --no-spawn --token q3PatifZhyju...

# 换端口，dsh 用完整路径启动
node src/index.js --listen 8080 --dsh-port 3100 --dsh-cmd /home/ubuntu/.npm-global/bin/dsh

# 调试模式（日志改走 stderr，并额外输出例行事件：客户端断开清理、每次刷新的例行重新注入等）
DSH_PROXY_DEBUG=1 node src/index.js
```

`--listen` 与 `--dsh-port` 不能相同（否则代理会转发给自己），相同会以退出码 2 拒绝。

## Docker 用法

```dockerfile
FROM node:24
COPY src /app/src
WORKDIR /app
ENTRYPOINT ["node", "src/index.js"]
```

```bash
docker run -d --name dsh-proxy -p 13080:13080 dsh-proxy-image
# 局域网设备访问 http://<宿主机IP>:13080/
```

注意：

- 容器内必须有 `dsh`（在 PATH 中，或用 `--dsh-cmd` 指定完整路径）。
- 若 dsh 在容器外（宿主机）运行：代理与 dsh 必须共享网络命名空间
  （`docker run --network=host`），此时用 `--no-spawn`。
- dsh 始终在 `127.0.0.1` 启动，外部只能经由代理访问，不会暴露额外端口。

## 工作原理

**Host/Origin 改写（核心机制）。** dsh 的 API 信任栅栏要求请求的 `Host`
必须是 loopback 地址，且若存在 `Origin` 头必须与 Host 完全一致，否则返回 403。
局域网浏览器访问时发出的是 `Host: 192.168.x.y:13080` / `Origin: http://192.168.x.y:13080`，
会被直接拒绝。代理对**每个**请求（HTTP 与 WebSocket 升级）都把这两个头改写为
`127.0.0.1:<dsh-port>`，栅栏因此放行；会话 cookie 的 authority 由（改写后的）
Host 推导，端到端保持一致，登录态正常工作。

**token 重定向。** 代理无法校验 dsh 签发的 cookie，只能以后端响应为准：
当 dsh 对 `GET /` 或 `GET /index.html` 返回 401、且代理已知 token 时，
以 `302` 相对跳转 `/?token=<token>`（`Cache-Control: no-store`）应答。
相对跳转自动解析到用户实际访问的主机（`http://192.168.2.x:13080/?token=...`）。
其余 401（API、未知 token、非首页）原样透传。token 抓取后该重定向立即生效；
dsh 若再次公告 token（如重启），以最新值为准。

**首页改写（设置/语言可用性的关键）。** dsh 客户端的"特权面"——设置文档
的读取与写入（模型目录、Provider 配置、密钥）、语言偏好的持久化——由
`ctx.connection.isLoopback` 控制，而客户端**只看页面自身的
`location.hostname`** 计算这个标志（loopback 判定不读任何服务端信息），
局域网 IP 一律判为否。其后果：

- 设置层退化为 `memory` 持久化：设置文档镜像从不发起 `settings/describe`
  读取，"设置-模型"页报 `settings are unavailable in this browser`
  （此时 API 本身经代理是通的，`/api/llm/listProviders` 等返回 200）；
- 语言选择写入被静默丢弃（表单控制器在 memory 模式下直接返回 false），
  下次加载回落到浏览器语言，表现为"设置了中文，刷新又变回英文"。

客户端提供官方的壳传输契约 `globalThis.__DSH_TRANSPORT__`
（`ClientTransportHooks`）：`ownsHost: true` 声明"页面完整拥有 Host"，
直接置位 `isLoopback`；其余字段全部可选，缺省回落到标准浏览器载体
（全局 `fetch`、Gateway WebSocket、HTTP 加载 bundle），因此最小声明
`{ ownsHost: true }` 只翻转这一个判定，不改变任何传输行为。

本代理正是这样一位"拥有者"：dsh 只绑定 loopback，代理是外部唯一入口，
会话已经过 dsh 自身的浏览器会话 cookie 认证——经代理的会话与 loopback
会话的信任级别相同，注入符合契约语义。实现上：

- 仅对 `GET /` 与 `GET /index.html` 的 `200 text/html` 响应缓冲整个文档
  （上限 2 MiB，超限自动退化为原样流式转发）；
- 在 `<head>` 开始标签后注入内联经典脚本
  `<script>globalThis.__DSH_TRANSPORT__=globalThis.__DSH_TRANSPORT__??{ownsHost:true}</script>`。
  经典内联脚本在文档解析期执行，先于 `<head>` 里延迟加载的
  `type="module"` 应用入口，客户端启动读全局时声明已就位；
- `??` 保证幂等且无破坏：dsh 未来若自带传输声明则原样透传，绝不覆盖；
  文档中已含 `__DSH_TRANSPORT__`、找不到 `<head>` 锚点、或上游编码
  不可解码（仅支持 identity/gzip/deflate）时同样退化为原样透传，
  并在日志中说明原因；
- 改写后的响应以 identity 重发，`content-length` 按新长度重算，
  其余响应头（`Set-Cookie` 等）原样保留。静态资源、API、WebSocket
  均不受影响（已验证字节级一致）。

安全含义：注入后，能访问代理端口的用户即可读写 dsh 设置文档（含 API
密钥等敏感配置）。这与本工具的既有信任模型一致——dsh 的 LAN 信任机制
（`trustedHosts` 从 0.0.0.0 绑定推导局域网 IP）同样假设局域网内可达即
可信；代理端口只应暴露给可信网络。

**透明转发。** 其余响应体流式管道转发（不缓冲，SSE / 长连接无压力），
剥离 hop-by-hop 头与 `transfer-encoding`（Node 已解 chunked），
保留 `Set-Cookie`、`Location`、`Content-*` 等；上游 keep-alive 连接池复用。
上游不可达时返回 502 并说明原因；客户端中途断开（关页、刷新页面）时同步
终止上游请求——这种**客户端主动**的拆除只是预期清理，不会记为上游错误
（否则每次刷新都会刷出一条 `upstream ... error ... ECONNRESET`，因为浏览器
刷新时会掐断对 `/plugins/events` SSE 通道的长连接）；真实的上游故障
（如 dsh 崩溃）照常记日志并对未应答的请求回 502。

**WebSocket。** `upgrade` 请求以改写后的头重建原始字节序列，`net.connect`
直连 dsh，双向 pipe 直至任一端关闭（覆盖 `/api/remote.mux` 等长连接）。

**进程生命周期。** dsh 以 `detached: true` 派生（独立进程组），
因为它可能再派生 web 服务子进程，杀组才能连根带走：

- 代理收到 SIGINT/SIGTERM 退出 → 对子进程组发 SIGTERM，3 秒未退出升级 SIGKILL；
- dsh 子进程先行退出 → 代理以子进程退出码退出（信号终止为 143）；
- 其他任何退出路径（`process 'exit'` 钩子）也会尽力终止子进程组。

## 行为细节与排障

| 现象 | 说明 |
| --- | --- |
| dsh 尚未就绪时的请求 | 代理返回 502 `cannot reach dsh on 127.0.0.1:<port>`，dsh 就绪后自动恢复，无需重启代理 |
| 15 秒后仍无 token | 日志提示 warning（dsh 启动异常时可见） |
| `--no-spawn` 未给 `--token` | 代理仍转发，但未登录用户看到 dsh 的 401 页面而非自动跳转 |
| `EADDRINUSE` | 代理日志提示端口占用，换 `--listen` |
| 403 | 基本不会出现（Host/Origin 已改写）；若出现，检查 dsh 版本栅栏行为 |
| 日志：刷新页面后出现 `upstream ... error ... ECONNRESET` | 旧版行为：浏览器刷新会掐断对 `/plugins/events`（SSE）的长连接，代理随之拆除上游连接，旧版把这种**客户端主动**的拆除误记为上游错误。已修复：此类拆除不再记日志（`DSH_PROXY_DEBUG=1` 下仅输出 `client left before completion: ...` 一行）；真实上游故障（dsh 崩溃等）仍会记日志并对未应答请求回 502 |
| 日志：`index document: transport declaration re-injected` | 仅调试模式（`DSH_PROXY_DEBUG=1`）输出；每次首页加载（刷新）都会例行重新注入，属正常；首次注入 `injected __DSH_TRANSPORT__ ...` 仍输出到常规日志 |
| 退出码 | 0 正常/信号关停；2 参数错误；1 启动失败；其余为 dsh 子进程退出码 |

## 目录结构

按约定所有 `.js` 与 `package.json` 均在 `src/` 下：

```
src/
├── package.json   # 零依赖，bin: index.js
├── index.js       # 入口：参数解析、派生 dsh、token 抓取、生命周期
├── args.js        # 命令行解析（--flag / --flag=value，UsageError 退出码 2）
├── token.js       # dsh 控制台 token 行解析（TokenLineParser，按行缓冲）
└── proxy.js       # 代理服务器：Host/Origin 改写、401 重定向、首页 __DSH_TRANSPORT__ 注入、WS 转发
```

## 已验证（dsh 0.2.0-rc.2 / Node 24）

- 完整登录流：未登录 `GET /` → 302 `/?token=...` → 303 + `Set-Cookie`
  （cookie authority 为 `127.0.0.1:<dsh-port>`，证明 Host 改写生效）→ 200 首页；
- 局域网模拟（`Host`/`Origin` 为 LAN IP）：登录流、API 信任栅栏、
  WebSocket 升级（101 + 握手后 mux 数据透传）全部通过；
  对照组：同一请求直连 dsh 返回 403，证明改写是放行的必要条件；
- `--no-spawn --token` 手动 token 路径全流程通过；
- 生命周期双向：SIGTERM 关代理 → dsh 进程组约 1 秒内全部退出、端口释放；
  dsh 先退出 → 代理以相同退出码退出，无孤儿进程；
- 边界：后端不可达 502、非法参数/同端口退出码 2、`--help`；
- 首页改写：identity 与 gzip 请求均得到注入 `__DSH_TRANSPORT__` 的文档
  （gzip 请求以 identity 重发、`content-length` 正确、`/index.html` 同效），
  文档其余部分（bundle 引用、插件 preload、`__DSH_CONTACT_CONFIG__`）完整无损；
  静态资源与插件 bundle 经代理字节级一致（10.5 MB / 950 KB 两组对照）；
  WebSocket 升级行为与未改写版完全一致；
  `settings/describe` / `llm/listProviders` 经代理 200，`settings/mutate`
  冲突保护验证通过（错误修订号被拒、文档零改动）——注入后设置读取、
  写入（含语言偏好持久化）与 loopback 访问等效；
- 日志降噪（本次修复）：刷新页面（浏览器掐断 `/plugins/events` SSE）与
  上游应答前的客户端断开，均不再产生 `upstream ... error ... ECONNRESET`
  日志（修复前每次刷新必现）；非调试模式下"加载 + 刷新 + SSE 断开"全程
  零日志输出；真实上游故障（模拟后端中途崩溃）仍正常记日志并对客户端
  返回 502；登录流与首页注入行为与修复前完全一致。

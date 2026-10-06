# dsh-docker-proxy

## 背景和要求

* deepseek-harness 无法监听 0.0.0.0，导致局域网其他设备无法访问 dsh (deepseek-harness) 服务。为此需要写一个代理程序，监听一个端口并将请求转发到dsh服务的端口（由`--dsh-port`指定）。

* `dsh web` 启动命令会给出 token，docker环境下用户很难获得token。为此，代理程序需要能够获取这个token，并且在用户请求到来的时候，利用重定向将token一起转发。例如：
  * `dsh web` 运行在容器中，dsh服务端口3080。dsh服务启动时控制台会告知token，代理服务需要记录token
  * 用户访问 http://192.168.2.x:13080，这里的13080就是代理监听的端口，代理需要将请求转发到127.0.0.1:3080的dsh服务
  * 注意，第一次用户访问 http://192.168.2.x:13080 如果没有提供token访问会被拒绝，代理获得用户请求后，需要让用户访问 http://192.168.2.x:13080/?token=xxx

dsh 启动示例如下：
```
dsh web --port 3080
dsh web: http://127.0.0.1:3080/?token=q3PatifZhyjuUwng_2_sT7rKUoUxvIFvWx1_4NDLELc
dsh web: opening the default browser; pass --no-open to disable
```

## 目标

* 使用 nodejs 实现dsh的代理程序，并满足上述要求
* 如果使用Spawn，主进程结束后子进程也应该一起结束。
* 反向不耦合：DSH 进程终止时 Node（代理）不要停止。典型场景：dsh-market 安装/删除插件后在 market 中重启 dsh 服务——dsh 会派生 detached 辅助进程并自杀，辅助进程在同一端口拉起替换 dsh；代理必须保持运行，转发不中断，并自动从 market 的 restart 日志（`<tmpdir>/dsh-market-restart-*.out.log`）抓取替换 dsh 的新 launch token，保持 token 重定向有效。

## 目录结构

将所有js和package.json文件放在src目录下。

## 源码参考

deepseek-harness 的源码位于 `../sources/deepseek-harness`

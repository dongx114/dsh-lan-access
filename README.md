# DSH 局域网访问

这是独立的 DSH Web 插件，在「设置 → 远程连接」增加「局域网访问」开关。适用于经验证的 `0.2.3-alpha.2` Web 运行时，包括本地桌面启动器加载的 Web 版本。

## 安装和使用

1. 在 DSH CLI 中运行 `dsh plugin --profile web add github:dongx114/dsh-lan-access` 安装到 `web` profile。
2. 重启 DSH，让它加载新插件。打开本机 DSH 的「设置 → 远程连接」，打开「局域网访问」。检测到多个网卡时，选择和另一台设备处于同一网段的网卡。
3. 从另一台设备打开面板的新登录链接，或者打开开关下方的访问地址发起设备配对。核对配对码后在主机上批准。
4. 关掉开关会立即停止局域网监听并断开已有局域网连接。开关默认为关闭，DSH 重启后也默认关闭。

卸载命令为 `dsh plugin --profile web remove dsh-lan-access`。卸载后重启 DSH。

从本地源码安装时，在项目目录运行 `npm pack`，再运行 `dsh plugin --profile web add ./dsh-lan-access-0.1.0.tgz`。

## 兼容性

插件只在选定的私有 IPv4 地址上开启 HTTP 监听，只接受同一网段的连接。Windows 防火墙和无线接入点的设备隔离仍可影响连通性。主机上的 `127.0.0.1` 服务保持可用，局域网请求沿用 DSH 的官方鉴权。

界面使用官方 `settings.remoteConnection.extensions` 扩展点。实时开关使用此版本的 Web 服务和可信 Host 列表的内部结构。升级 DSH 后需重新验证兼容性。

## 许可证

[MIT](LICENSE)

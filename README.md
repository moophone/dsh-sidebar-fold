# dsh-sidebar-fold

把 DSH 侧边栏里那一长串**全局面板行**（插件、终端、容器、记忆、今日值得读……）折叠成单独一行「**插件大全**」，把被挤掉的工作区高度还给会话列表。

纯客户端插件：**零依赖、零构建链**，安装即用。

## 效果

折叠前，侧边栏上半部分被 10+ 个插件行占满：

```
泡泡猫的影视工具 / 今日值得读 / 全局搜索 / 终端 / 容器 / 插件 / 插件市场
自动化任务 / 上下文洞察 / 论衡运行 / 记忆      ← 工作区被压成一条缝
────────────────────────────────
工作区（会话列表）
```

折叠后只剩一行，点它打开「插件大全」面板：

```
📁 插件大全                                ← 一行
────────────────────────────────
工作区（会话列表）                          ← 高度回来了
```

面板里列出全部面板项（带各自的图标），点任意一项直接跳过去；也提供一个开关，可以随时把侧边栏临时展开回全貌。**原来插件的功能一个都没丢**，只是换了个入口。

## 安装

前置：已安装 `dsh` CLI。

```sh
dsh plugin --profile <name> add dsh-sidebar-fold
```

其他形式：

```sh
# GitHub 源码安装（会自动跑 prepare；本包无需构建，pnpm 不会要求授权）
dsh plugin --profile <name> add github:you/dsh-sidebar-fold

# 本地开发
dsh plugin --profile <name> add link:/abs/path/to/dsh-sidebar-fold

# 预打包 tarball（无需任何构建授权）
dsh plugin --profile <name> add ./dsh-sidebar-fold-0.1.0.tgz
```

`dsh plugin add` 会自动完成三处登记，不需要手改任何 profile 文件：

| 位置 | 内容 |
|---|---|
| `<profile>/package.json` → `dependencies` | `"dsh-sidebar-fold": "..."` |
| `<profile>/package.json` → `dsh.profile.bundles` | 追加 `"dsh-sidebar-fold"` |
| `<profile>/cordis.patch.yml` | 本包的 `insert` 层 |

卸载：

```sh
dsh plugin --profile <name> remove dsh-sidebar-fold
```

> **重要**：客户端 bundle 是在 DSH 启动时加载的，改完插件或装完插件后**必须完整重启 DSH**，只刷新浏览器页面不生效。

## 它是怎么做到的

不改 DSH 宿主源码，全部走官方插件契约：

1. **注册一对席位** —— `sidebar.panellist`（侧边栏那一行，`order: -1000` 排在最前）+ `main` key `dsh-sidebar-fold`（「插件大全」面板本体）。
2. **面板内容实时** —— 用 `slots.entriesOfSlot('sidebar.panellist')` 读出全部面板行，配 `slots.subscribe()` 订阅增删；点击走 `layout.selectPanel(id)` 跳转。
3. **折叠靠 DOM** —— 给自己那一行渲染一个带唯一类名 `dsh-fold-glyph` 的图标，从它出发 `closest('nav')` 找到侧边栏那个 `nav`，再把其余子元素 `display: none`。
4. **不靠任何脆弱的定位** —— 不用 CSS Modules 的编译期哈希类名（重构即废），也不用 `aria-label`（会随界面语言变）。唯一锚点是自己渲染的那个类名。
5. **持续自适应** —— `MutationObserver` 监听 `document.body`，面板行增删、界面语言切换都会重新应用折叠。
6. **状态可持久** —— 展开/折叠存 `localStorage`，重启不丢。
7. **退场干净** —— 插件被卸载/禁用时恢复所有被隐藏的行、注销两个席位、若主区正停在自己的面板上先 `selectPanel(null)` 切走，不会留一块空白。

## 兼容性

- 纯客户端（`dsh.client.platform: 'web'`），Host 侧只有一个空 `apply` 占位（cordis 要求 `exports["."]` 指向真实文件）。
- 只 `require('react')` 且只用 `createElement`（不依赖 jsx-runtime），ES5 风格源码，浏览器直接执行。
- 不读取、不上传任何数据；除 `localStorage` 里那一个开关状态外不写任何持久化。

## 排障

装上重启后没反应，打开浏览器控制台：

- 看到 `[dsh-sidebar-fold] host has no slots service — panel folding disabled`：宿主没提供 slots 服务（DSH 版本过旧），插件已主动放弃而不是静默失效。
- 什么都没有：确认改的是 `dsh` 正在跑的那个 profile（`dsh --profile <name>`），以及确实重启过 GUI。

## 开发

```sh
node --check host/index.js
node --check client/client.js
```

改 `client/client.js` 后必须重启 DSH 才会重新加载。

## License

[MIT](./LICENSE)

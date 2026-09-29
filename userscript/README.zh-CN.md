# Open In New Tab - 油猴脚本版本

[English](README.md) | [简体中文](README.zh-CN.md)

一个 Tampermonkey 用户脚本，使用白名单模式强制所有链接在新标签页中打开，支持暗色模式和国际化。

> **版本号说明**：油猴脚本走独立的 SemVer 节奏，与 Chrome 扩展版本号已解耦。完整的脚本端发布历史见 [`../CHANGELOG.md`](../CHANGELOG.md)。

📖 **[官方网站](https://open-in-new-tab.vercel.app/)** | 🎯 **[从 Greasy Fork 安装](https://greasyfork.org/zh-CN/scripts/551033-open-in-new-tab)** | 🌟 **[GitHub 仓库](https://github.com/shiroixw/OpenInNewTab)**

## 功能特性

-   **白名单模式**：只在指定的域名上生效，更好的控制和性能
-   **动态内容支持**：处理现有和动态添加的链接
-   **安全性**：添加 `rel="noopener noreferrer"` 确保安全
-   **轻量级**：高效的 DOM 监控，对性能影响最小
-   **用户友好的管理**：基于菜单的白名单管理
-   **白名单管理器**：完整的界面，可查看、添加、修改和删除域名
-   **持久化存储**：使用 Tampermonkey 的 GM\_\* API 保存用户偏好
-   **暗色模式支持**：自动适配系统暗色/亮色模式偏好
-   **现代化 UI**：简洁、响应式设计，流畅的动画和悬停效果
-   **国际化**：根据浏览器设置自动检测语言（English / 简体中文 / 繁體中文）

## 安装

### 方式 1：从 Greasy Fork 安装（推荐）

1. **安装 Tampermonkey：**

    - [Chrome/Edge](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
    - [Firefox](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)
    - [Safari](https://apps.apple.com/cn/app/tampermonkey/id1482490089)

2. **安装脚本：**
    - 访问 [Greasy Fork](https://greasyfork.org/zh-CN/scripts/551033-open-in-new-tab)
    - 点击绿色的"安装此脚本"按钮
    - Tampermonkey 将打开脚本详情页
    - 点击"安装"完成

### 方式 2：手动安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击浏览器工具栏中的 Tampermonkey 图标
3. 选择"创建新脚本"
4. 复制 `OpenInNewTab.user.js` 的代码
5. 粘贴到编辑器中
6. 保存脚本（Ctrl+S 或 文件 → 保存）

## 配置

### 初始设置

脚本默认带有空白的白名单。您可以根据需要修改 `DEFAULT_DOMAINS` 数组。

### 用户管理

#### 通过菜单快速访问

右键点击浏览器工具栏中的 Tampermonkey 图标以访问脚本命令。

#### 添加当前域名（快速添加）

1. 访问您想要添加到白名单的任何网站
2. 右键点击浏览器工具栏中的 Tampermonkey 图标
3. 选择"添加当前网站到白名单"（或英文的 "Add Current Site to Whitelist"）
4. 当前域名将立即添加
5. 将显示确认通知

#### 管理您的白名单

1. **打开白名单管理器：**

    - 右键点击 Tampermonkey 图标
    - 选择"管理白名单"（或英文的 "Manage Whitelist"）
    - 将打开一个模态对话框

2. **在白名单管理器中：**
    - **查看所有域名**：在一个清晰、有组织的列表中查看您的完整白名单
    - **添加新域名**：输入域名（例如：`example.com`）并点击"添加"
    - **删除域名**：点击任何域名旁边的红色"移除"按钮
    - **关闭**：点击 × 按钮或点击模态框外部

### 域名匹配

脚本支持精确域名匹配和子域名匹配：

-   `example.com` 精确匹配 `example.com`
-   `example.com` 也匹配 `sub.example.com`、`deep.sub.example.com` 等

## 工作原理

1. **初始化**：脚本加载并注册菜单命令以进行白名单管理
2. **白名单检查**：检查当前域名是否在您的个人白名单中
3. **链接修改**：如果在白名单中，修改所有现有链接以在新标签页中打开
4. **动态监控**：设置 MutationObserver 处理动态添加的内容
5. **安全增强**：添加安全属性（`rel="noopener noreferrer"`）以防止安全问题
6. **持久化存储**：使用 Tampermonkey 的 GM\_\* API 保存您的白名单偏好

## 语言支持

脚本会自动检测您的浏览器语言，并以相应语言显示界面。你也可以在设置模态框中手动覆盖（自动 / English / 简体中文 / 繁體中文）。

-   **English**（默认）：当浏览器语言不是中文时使用
-   **简体中文（zh-CN）**：当浏览器语言以 `zh` 开头（如 zh-CN）时使用
-   **繁體中文（zh-TW）**：用于 zh-TW / zh-HK / zh-MO / zh-Hant 等变体

所有用户界面元素均已国际化，包括菜单命令、模态对话框、通知和域名显示。翻译文案以 `shared/locales/us/{en,zh-CN,zh-TW}.json` 为唯一来源；运行 `npm run i18n:sync` 重新生成内联的 `languageResources` 代码块。

## 暗色模式支持

白名单管理界面会自动适配您的系统暗色/亮色模式偏好：

-   **亮色模式**：简洁的白色界面，带有微妙的阴影
-   **暗色模式**：暗色主题，具有适当的对比度以提高可读性
-   **平滑过渡**：无缝的主题切换，没有突兀的变化

## 安全考虑

-   脚本仅在白名单域名上运行
-   使用 `rel="noopener noreferrer"` 防止新页面访问原始页面
-   避免修改下载链接（带有 `download` 属性的链接）
-   用户数据使用 Tampermonkey 的安全存储 API 本地存储

## 浏览器兼容性

-   Chrome/Chromium（配合 Tampermonkey）
-   Firefox（配合 Tampermonkey 或 Greasemonkey）
-   Safari（配合 Tampermonkey）
-   Edge（配合 Tampermonkey）

> 白名单实时联动与菜单项动态切换依赖 `GM_addValueChangeListener` 与 `GM_unregisterMenuCommand`，需要 Tampermonkey 4.13+。在更老的脚本管理器（如 Greasemonkey 4）上脚本会自动降级——白名单变更需要刷新页面才能生效，并且"加入 / 移出"两个菜单项会同时常驻。

## 与扩展的已知差异

油猴脚本和 Chrome 扩展共享同一套白名单逻辑与链接拦截行为。从 v1.7.0 起，脚本端也拥有自己的设置中心，剩余差异主要由平台限制造成：

| 能力 | 扩展 | 脚本 |
|---|---|---|
| 点击拦截（capture 阶段 `preventDefault` + `window.open`） | ✅ | ✅ |
| 跳过规则（download / 修饰键 / 中键 / `javascript:` / `mailto:` / `tel:` / `#anchor`） | ✅ | ✅ |
| 白名单变更免刷新生效 | ✅ via `chrome.storage.onChanged` | ✅ via `GM_addValueChangeListener`（TM 4.13+） |
| 菜单标签动态切换（当前域名 加入 ↔ 移出） | ✅ popup 切换 | ✅ 菜单重注册 |
| 主题手动覆盖（自动 / 浅色 / 深色） | ✅ | ✅ |
| 语言手动覆盖（自动 / English / 中文） | ✅ | ✅ |
| JSON 白名单 导入 / 导出 | ✅ | ✅（油猴菜单 → 打开设置） |
| Toast 通知（非阻塞） | ✅ | ✅ |
| 欢迎页 / 引导 | ✅ 安装时打开 | ✅ via `GM_openInTab`，不可用时降级为可点击的 toast |
| 后台打开（`active: false`，不抢焦点） | ✅ | ⚠️ 实验性 — 默认关闭，需要 `GM_openInTab`（仅 Tampermonkey） |
| 新 tab 插入到原 tab 右侧 | ✅ via `chrome.tabs.create({ index })` | ⚠️ 仅在启用"后台打开"时（`GM_openInTab` 的 `insert: true`）；否则追加到末尾 |
| 设置变更后自动 reload 其他 tab | ✅ via `chrome.tabs.reload` | ❌ 各 tab 通过 storage 监听器各自更新 |
| iframe 覆盖 | 仅顶层 | 仅顶层（`@noframes`） |

脚本以"**链接拦截行为对齐**"为首要目标（这是用户感知最强的核心）；目前唯一保留的能力差距是"主动 reload 其他 tab"，因为油猴脚本没有 `tabs` 权限。

## 许可证

MIT License - 详见 LICENSE 文件

## 贡献

1. Fork 本仓库
2. 进行更改
3. 充分测试
4. 提交 Pull Request

## 问题反馈

如果您遇到任何问题或有建议，请在 GitHub 上创建 issue。

## 相关项目

-   [Chrome 扩展版本](../extension/README.zh-CN.md) - 相同功能的浏览器扩展
-   [项目根目录](../README.zh-CN.md) - 主项目文档

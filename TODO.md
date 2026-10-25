# TODO

## ✅ Done

- 扩展 v1.8.0 更新提示（原 P1 "插件更新横幅"）
  - `extension/update-notices.js` 按版本登记 notify / silent；`npm run release:check` 校验"当前版本有登记 + 三语言文案完整 + CHANGELOG 有条目"，并挂在 `pack:extension` 与发布流水线上
  - 投递方式是 popup **底部一行**可关闭提示（`v1.8.0 · 一句说明` + 查看更新），不与"当前域名 / 添加"抢动线；**不新开标签页**；关闭态写 `dismissedUpdateNotice`（按版本），`updateNoticeEnabled: false` 彻底关闭（设置页 `Updates` 开关）
  - 三语言分工：UI chrome（关闭 / 查看更新 / 开关文案 / 页脚 Release notes）进 `shared/locales/ext/*.json`；每版本内容留在 `update-notices.js`
  - 设置页页脚新增 `v{version} · Release notes` 常驻入口

- 油猴脚本 v1.7.1（P0）样式对齐 + 工程解耦
  - 建立 `shared/STYLE_TOKENS.md` 作为双端颜色 SSoT，扩展 CSS / 脚本 JS 双向 MIRROR
  - 扩展端 `--btn-primary*` → `--color-accent*` 全量改名清债（`popup.css` / `options.css` / `welcome.css` / `popup.js` / `options.js`）；同步引入 `--color-danger*`
  - 脚本设置中心皮肤化对齐 `extension/STYLE_GUIDE.md`：去 gradient、彩色 shadow、Material 红绿；Remove 改 ghost；toast 颜色 `success/info/error` 与扩展语义一致
  - 版本号解耦：扩展 (`extension/manifest.json`) 与脚本 (`// @version` + `SCRIPT_VERSION`) 各自独立 SemVer；`scripts/version-core.mjs` 双轨化；`bump-extension.mjs` / `bump-userscript.mjs` 取代旧 `bump-patch.mjs` 与 `sync-version.mjs`；`version:verify` 缩范围到 website ↔ manifest + userscript 自一致
  - pre-commit 钩子从"自动 bump"改为"仅 verify"，把版本号控制权交还给开发者
  - `CHANGELOG.md` 起步（双轨：Userscript / Extension 各自时间线）

- 油猴脚本 v1.7.0（P1）设置中心对齐扩展
  - 抽象层：`state.settings` / `state.caps` / `getEffectiveTheme` / `getEffectiveLanguage`，`getThemeColors` / `getText` / `handleLinkClick` 全部切换到新数据源
  - i18n 字典扩展（约 25 keys × 2 lang）+ Toast 单例容器（success/info/error，最多同屏 3 条，3s 自动消失），全量替换 `alert`
  - 模态框重构为 Whitelist + Preferences + About 三段，单 `renderModalBody()` 入口；theme/language 切换实时 re-render
  - JSON 白名单 导入 / 导出（带 schema 版本号；导入兼容多格式 + 合并/覆盖二选一 + 无效条目静默丢弃）
  - 后台打开（实验性）：`GM_openInTab({ active: false })`，feature-detect，不可用时 checkbox disabled
  - 欢迎页：`__installed_at` + `userWhitelist.length` 双因子哨兵，`GM_openInTab` 不可用时降级为可点击的长 toast（避免老用户升级被打扰）
  - 菜单升级：`manageWhitelist` → `openSettings`

- 油猴脚本 v1.6.0（P0）核心能力补齐
  - 修复 `@updateURL` / `@downloadURL` → raw URL（之前指向 GitHub `blob/` HTML 页，自动更新失效）
  - 加 `@noframes` 与 `@grant`：`GM_unregisterMenuCommand` / `GM_addValueChangeListener` / `GM_removeValueChangeListener`
  - 真点击拦截（capture 阶段 `preventDefault` + `window.open`），同步路径不被弹窗拦截
  - 跳过逻辑：download / 修饰键 / 中键 / `javascript:` / `mailto:` / `tel:` / `#anchor`
  - target patching + `data-oint-patched` 标记 + 可回滚
  - MutationObserver + `requestIdleCallback` 节流批处理
  - 白名单变更免刷新生效（同 tab + 跨 tab）
  - 菜单项 toggle：当前域名"加入"↔ "移出"动态切换，老管理器自动降级

- 扩展拦截生命周期：同步点击（缓存偏好 + `tabs.create`）、白名单热挂载、`tel:` 跳过、href 观察 + idle 批处理、去掉 popup WAR、域名列表改 DOM 渲染
- 官网去掉 Google Fonts Inter，改用系统字体栈
- 文档确认双轨 SemVer：不锁版本、不强制递增；后续以扩展为主

## 🎯 P1（通用，仍待办）

- 官网 changelog 页面（指向 `CHANGELOG.md`）
- 官网 docs 页面

## 🧱 P2（工程化，下一个大版本）

- 抽 `shared/core/` 并 inline 进油猴脚本（扩展已有 `extension/link-policy.js`；油猴端仍单文件，等有构建步骤再抽）
- `scripts/build-userscript.mjs`：把 `shared/core` inline 进 `.user.js`，发布前自动跑
- `shared/STYLE_TOKENS.md` 机械翻译为 `shared/core/style-tokens.{json,css,js}`，由扩展 CSS 与脚本 build 各自消费（命名已 1:1，迁移成本机械）
- 域名规范化：去 `www.` / 小写 / IDN（`new URL(...).hostname`）

## 🧊 Backlog（暂不做，等用户反馈再启动）

- 跨 tab 主动 reload —— 油猴端无 `tabs` 权限，不可行；现有方案（每页通过 storage 监听器自更新）已等价
- 在本站临时禁用（`sessionStorage` per-tab 暂停）—— v1.8.0 评估时砍掉，与扩展端能力对齐原则相悖
- 键盘快捷键（Alt+Shift+W/S/D）—— 同上，扩展端也未提供
- 域名规范化迁移（normalize + matchHost + 一次性写回白名单）—— 等扩展端先做，再双端同步
- 导出 schema v2（含偏好快照）—— 等扩展端先做

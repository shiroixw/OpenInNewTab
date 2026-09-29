// ==UserScript==
// @name              Open In New Tab
// @name:zh-CN        Open In New Tab - 链接强制新标签页打开
// @name:zh-TW        Open In New Tab - 連結強制新分頁開啟
// @namespace         https://github.com/shiroixw/OpenInNewTab
// @version           1.7.1
// @description       Force links to open in a new tab on whitelisted sites only. One-click add or remove the current domain from the Tampermonkey menu, with subdomain matching, dynamic-content support, dark mode, and English / 简体中文 / 繁體中文 UI. Other sites stay untouched.
// @description:zh-CN 基于白名单的链接拦截脚本：仅在你勾选的网站把链接强制改为新标签页打开，其它网站完全不受影响。油猴菜单一键加入/移出当前域名，支持子域名匹配、深色模式与中英文界面。
// @description:zh-TW 基於白名單的連結攔截腳本：僅在你勾選的網站把連結強制改為新分頁開啟，其它網站完全不受影響。油猴選單一鍵加入/移出目前網域，支援子網域匹配、深色模式與中英文介面。
// @author            Xiaowu
// @match             *://*/*
// @noframes
// @homepageURL       https://github.com/shiroixw/OpenInNewTab
// @supportURL        https://github.com/shiroixw/OpenInNewTab/issues
// @icon              https://raw.githubusercontent.com/shiroixw/OpenInNewTab/main/extension/icons/icon128.png
// @updateURL         https://raw.githubusercontent.com/shiroixw/OpenInNewTab/main/userscript/OpenInNewTab.user.js
// @downloadURL       https://raw.githubusercontent.com/shiroixw/OpenInNewTab/main/userscript/OpenInNewTab.user.js
// @license           MIT
// @grant             GM_setValue
// @grant             GM_getValue
// @grant             GM_registerMenuCommand
// @grant             GM_unregisterMenuCommand
// @grant             GM_addValueChangeListener
// @grant             GM_removeValueChangeListener
// @grant             GM_openInTab
// @run-at            document-start
// ==/UserScript==

;(function () {
    "use strict"

    // ─────────────────────────────────────────────────────────────
    // Constants & module state (mirrored from extension/content.js)
    // ─────────────────────────────────────────────────────────────
    const STORAGE_KEY_WHITELIST = "userWhitelist"
    const STORAGE_KEY_THEME = "theme"
    const STORAGE_KEY_LANGUAGE = "language"
    const STORAGE_KEY_OPEN_IN_BG = "openInBackground"
    const STORAGE_KEY_INSTALLED_AT = "__installed_at"
    const PATCHED_ATTR = "data-oint-patched"

    const SETTINGS_KEYS = [
        STORAGE_KEY_THEME,
        STORAGE_KEY_LANGUAGE,
        STORAGE_KEY_OPEN_IN_BG,
    ]

    const DEFAULT_SETTINGS = Object.freeze({
        theme: "auto", // "auto" | "light" | "dark"
        language: "auto", // "auto" | "en" | "zh"
        openInBackground: false,
    })

    const SCRIPT_VERSION = "1.7.1"
    const PROJECT_HOME = "https://github.com/shiroixw/OpenInNewTab"
    const GREASY_FORK_SCRIPT_PATH = "scripts/551033-open-in-new-tab"
    // Official landing page (vercel.json → outputDirectory: "website").
    // Query string is a soft signal for future analytics; the page itself
    // does not need to read it.
    const WELCOME_URL =
        "https://open-in-new-tab.vercel.app/?from=userscript-welcome"

    /**
     * @type {{
     *   isApplied: boolean,
     *   observer: MutationObserver|null,
     *   menuIds: any[],
     *   pendingNodes: Node[],
     *   scheduled: boolean,
     *   listenerIds: any[],
     *   settings: { theme: string, language: string, openInBackground: boolean },
     *   caps: { canUnregisterMenu: boolean, canListenStorage: boolean, canOpenInTab: boolean },
     *   toastContainer: HTMLElement|null,
     *   toasts: HTMLElement[]
     * }}
     */
    const state = {
        isApplied: false,
        observer: null,
        menuIds: [],
        pendingNodes: [],
        scheduled: false,
        listenerIds: [],
        settings: { ...DEFAULT_SETTINGS },
        caps: {
            canUnregisterMenu: false,
            canListenStorage: false,
            canOpenInTab: false,
        },
        toastContainer: null,
        toasts: [],
    }

    /**
     * Default whitelisted domains
     * These are the initial domains that will be included
     */
    const DEFAULT_DOMAINS = []

    /**
     * Get user whitelist from storage
     * @returns {Array} Array of whitelisted domains
     */
    function getUserWhitelist() {
        const stored = GM_getValue(STORAGE_KEY_WHITELIST, [])
        return Array.isArray(stored) ? stored : DEFAULT_DOMAINS
    }

    /**
     * Save user whitelist to storage
     * @param {Array} domains Array of domains to save
     */
    function saveUserWhitelist(domains) {
        GM_setValue(STORAGE_KEY_WHITELIST, domains)
    }

    // ─────────────────────────────────────────────────────────────
    // Settings layer: persisted preferences (theme/language/bg) +
    // capability detection + effective-value getters (single source of truth)
    // ─────────────────────────────────────────────────────────────

    /**
     * Detect runtime capabilities once. Result is memoized on `state.caps`.
     */
    function detectCaps() {
        state.caps.canUnregisterMenu =
            typeof GM_unregisterMenuCommand === "function"
        state.caps.canListenStorage =
            typeof GM_addValueChangeListener === "function"
        state.caps.canOpenInTab = typeof GM_openInTab === "function"
    }

    /**
     * Read all settings keys into in-memory state.settings.
     * Unknown / invalid stored values fall back to DEFAULT_SETTINGS.
     */
    function loadSettings() {
        const theme = GM_getValue(STORAGE_KEY_THEME, DEFAULT_SETTINGS.theme)
        const language = GM_getValue(
            STORAGE_KEY_LANGUAGE,
            DEFAULT_SETTINGS.language
        )
        const openInBackground = GM_getValue(
            STORAGE_KEY_OPEN_IN_BG,
            DEFAULT_SETTINGS.openInBackground
        )

        state.settings.theme = ["auto", "light", "dark"].includes(theme)
            ? theme
            : DEFAULT_SETTINGS.theme
        // Legacy stored "zh" canonicalizes to "zh-CN".
        const validLangs = ["auto", "en", "zh", "zh-CN", "zh-TW"]
        const langRaw = validLangs.includes(language) ? language : null
        state.settings.language =
            langRaw === "zh"
                ? "zh-CN"
                : langRaw || DEFAULT_SETTINGS.language
        state.settings.openInBackground = Boolean(openInBackground)
    }

    /**
     * Persist a single setting key. The storage listener will reflect the
     * change back into `state.settings` on the same tick (next event loop).
     * @param {string} key
     * @param {*} value
     */
    function saveSetting(key, value) {
        GM_setValue(key, value)
        // Mirror immediately so synchronous reads after this call are correct.
        if (key === STORAGE_KEY_THEME) state.settings.theme = value
        else if (key === STORAGE_KEY_LANGUAGE) state.settings.language = value
        else if (key === STORAGE_KEY_OPEN_IN_BG)
            state.settings.openInBackground = Boolean(value)
    }

    /**
     * Resolve "auto" theme to a concrete light/dark by consulting matchMedia.
     * @returns {"light"|"dark"}
     */
    function getEffectiveTheme() {
        const t = state.settings.theme
        if (t === "light" || t === "dark") return t
        return isDarkMode() ? "dark" : "light"
    }

    /**
     * Resolve "auto" language to a concrete UI locale from navigator.language.
     * Stored "zh" (legacy) canonicalizes to "zh-CN".
     * @returns {"en"|"zh-CN"|"zh-TW"}
     */
    function getEffectiveLanguage() {
        const l = state.settings.language
        if (l === "en" || l === "zh-CN" || l === "zh-TW") return l
        if (l === "zh") return "zh-CN"
        return detectLanguage()
    }

    /**
     * Greasy Fork listing URL in the current UI language.
     * @returns {string}
     */
    function getGreasyForkUrl() {
        const lang = getEffectiveLanguage()
        const prefix = lang === "zh-CN" || lang === "zh-TW" ? lang : "en"
        return `https://greasyfork.org/${prefix}/${GREASY_FORK_SCRIPT_PATH}`
    }

    /**
     * Check if current domain is in whitelist
     * @returns {boolean} True if domain is whitelisted
     */
    function isWhitelisted() {
        const currentDomain = window.location.hostname
        const userWhitelist = getUserWhitelist()
        return userWhitelist.some(
            (domain) =>
                currentDomain === domain || currentDomain.endsWith("." + domain)
        )
    }

    /**
     * Add current domain to whitelist
     */
    function addCurrentDomainToWhitelist() {
        const currentDomain = window.location.hostname
        const userWhitelist = getUserWhitelist()

        if (!userWhitelist.includes(currentDomain)) {
            userWhitelist.push(currentDomain)
            saveUserWhitelist(userWhitelist)
            showToast(
                `${currentDomain} — ${getText("addedToWhitelist")}`,
                "success"
            )
        } else {
            showToast(
                `${currentDomain} — ${getText("alreadyInWhitelist")}`,
                "info"
            )
        }
    }

    /**
     * Remove current domain from whitelist (exact host match only).
     * Note: matches domain in storage exactly equal to hostname; will not
     * remove a parent-domain entry that current page inherited via suffix match.
     */
    function removeCurrentDomainFromWhitelist() {
        const currentDomain = window.location.hostname
        const userWhitelist = getUserWhitelist()
        const idx = userWhitelist.indexOf(currentDomain)

        if (idx > -1) {
            userWhitelist.splice(idx, 1)
            saveUserWhitelist(userWhitelist)
            showToast(
                `${currentDomain} — ${getText("removedFromWhitelist")}`,
                "success"
            )
        } else {
            showToast(
                `${currentDomain} — ${getText("notInWhitelist")}`,
                "info"
            )
        }
    }

    /**
     * Detect browser language setting.
     * zh-Hant / zh-TW / zh-HK / zh-MO → "zh-TW"; other zh* → "zh-CN".
     * @returns {"en"|"zh-CN"|"zh-TW"}
     */
    function detectLanguage() {
        const userLang = navigator.language || navigator.userLanguage || "en"
        const lower = String(userLang).toLowerCase()
        if (
            lower === "zh-tw" ||
            lower === "zh-hk" ||
            lower === "zh-mo" ||
            lower === "zh-hant" ||
            lower.indexOf("zh-hant") === 0 ||
            lower.indexOf("zh-tw") === 0 ||
            lower.indexOf("zh-hk") === 0 ||
            lower.indexOf("zh-mo") === 0
        ) {
            return "zh-TW"
        }
        if (lower.indexOf("zh") === 0) {
            return "zh-CN"
        }
        return "en"
    }

    /**
     * Language resources for internationalization.
     * Auto-generated by `npm run i18n:sync` from shared/locales/us/*.json.
     */
    // __I18N_START__
    const languageResources = {
        "en": {
            "modalTitle": "Open In New Tab — Settings",
            "settingsTitle": "Open In New Tab — Settings",
            "closeButton": "×",
            "sectionWhitelist": "Whitelist",
            "sectionPreferences": "Preferences",
            "sectionAbout": "About",
            "inputPlaceholder": "Enter domain, e.g., example.com",
            "addButton": "Add",
            "removeButton": "Remove",
            "addedToWhitelist": "Added to whitelist",
            "alreadyInWhitelist": "Already in whitelist",
            "removedFromWhitelist": "Removed from whitelist",
            "notInWhitelist": "Not in whitelist",
            "noDomains": "No domains in whitelist yet",
            "exportButton": "Export JSON",
            "importButton": "Import JSON",
            "exportSuccess": "Whitelist exported",
            "exportFailed": "Export failed",
            "importInvalidJson": "Invalid JSON file",
            "importEmpty": "No valid domains in file",
            "importMergeOrReplace": "OK = merge into current whitelist · Cancel = replace current whitelist",
            "importDoneMerge": "Imported {added} new · {skipped} skipped (duplicate / invalid)",
            "importDoneReplace": "Replaced whitelist with {total} domains · {skipped} invalid",
            "prefsTheme": "Theme",
            "prefsThemeAuto": "Auto",
            "prefsThemeLight": "Light",
            "prefsThemeDark": "Dark",
            "prefsLanguage": "Language",
            "prefsLanguageAuto": "Auto",
            "prefsLanguageEn": "English",
            "prefsLanguageZhCN": "简体中文",
            "prefsLanguageZhTW": "繁體中文",
            "prefsOpenInBg": "Open links in a background tab",
            "prefsOpenInBgHint": "Experimental · requires Tampermonkey",
            "prefsOpenInBgUnavailable": "Your script manager does not support GM_openInTab",
            "aboutVersion": "Version",
            "aboutHomepage": "GitHub",
            "aboutGreasyFork": "Greasy Fork",
            "addToWhitelist": "Add to Whitelist",
            "removeFromWhitelist": "Remove from Whitelist",
            "manageWhitelist": "Manage Whitelist",
            "openSettings": "Open Settings",
            "welcomeToast": "Welcome to Open In New Tab! Click here to learn more."
        },
        "zh-CN": {
            "modalTitle": "Open In New Tab — 设置",
            "settingsTitle": "Open In New Tab — 设置",
            "closeButton": "×",
            "sectionWhitelist": "白名单",
            "sectionPreferences": "偏好设置",
            "sectionAbout": "关于",
            "inputPlaceholder": "输入域名，如：example.com",
            "addButton": "添加",
            "removeButton": "移除",
            "addedToWhitelist": "已添加到白名单",
            "alreadyInWhitelist": "已在白名单中",
            "removedFromWhitelist": "已从白名单移除",
            "notInWhitelist": "不在白名单中",
            "noDomains": "白名单中暂无域名",
            "exportButton": "导出 JSON",
            "importButton": "导入 JSON",
            "exportSuccess": "白名单已导出",
            "exportFailed": "导出失败",
            "importInvalidJson": "JSON 文件无效",
            "importEmpty": "文件中没有有效域名",
            "importMergeOrReplace": "确定 = 合并到当前白名单 · 取消 = 覆盖当前白名单",
            "importDoneMerge": "导入新增 {added} 项 · 跳过 {skipped} 项（重复/无效）",
            "importDoneReplace": "已用 {total} 项覆盖白名单 · 无效 {skipped} 项",
            "prefsTheme": "主题",
            "prefsThemeAuto": "自动",
            "prefsThemeLight": "浅色",
            "prefsThemeDark": "深色",
            "prefsLanguage": "语言",
            "prefsLanguageAuto": "自动",
            "prefsLanguageEn": "English",
            "prefsLanguageZhCN": "简体中文",
            "prefsLanguageZhTW": "繁體中文",
            "prefsOpenInBg": "新链接在后台标签页打开",
            "prefsOpenInBgHint": "实验性 · 需要 Tampermonkey",
            "prefsOpenInBgUnavailable": "当前脚本管理器不支持 GM_openInTab",
            "aboutVersion": "版本",
            "aboutHomepage": "GitHub",
            "aboutGreasyFork": "Greasy Fork",
            "addToWhitelist": "加入白名单",
            "removeFromWhitelist": "移出白名单",
            "manageWhitelist": "管理白名单",
            "openSettings": "打开设置",
            "welcomeToast": "欢迎使用 Open In New Tab！点击此处了解更多。"
        },
        "zh-TW": {
            "modalTitle": "Open In New Tab — 設定",
            "settingsTitle": "Open In New Tab — 設定",
            "closeButton": "×",
            "sectionWhitelist": "白名單",
            "sectionPreferences": "偏好設定",
            "sectionAbout": "關於",
            "inputPlaceholder": "輸入網域，如：example.com",
            "addButton": "加入",
            "removeButton": "移除",
            "addedToWhitelist": "已加入白名單",
            "alreadyInWhitelist": "已在白名單中",
            "removedFromWhitelist": "已從白名單移除",
            "notInWhitelist": "不在白名單中",
            "noDomains": "白名單中暫無網域",
            "exportButton": "匯出 JSON",
            "importButton": "匯入 JSON",
            "exportSuccess": "白名單已匯出",
            "exportFailed": "匯出失敗",
            "importInvalidJson": "JSON 檔案無效",
            "importEmpty": "檔案中沒有有效網域",
            "importMergeOrReplace": "確定 = 合併到目前白名單 · 取消 = 覆蓋目前白名單",
            "importDoneMerge": "匯入新增 {added} 項 · 跳過 {skipped} 項（重複/無效）",
            "importDoneReplace": "已用 {total} 項覆蓋白名單 · 無效 {skipped} 項",
            "prefsTheme": "主題",
            "prefsThemeAuto": "自動",
            "prefsThemeLight": "淺色",
            "prefsThemeDark": "深色",
            "prefsLanguage": "語言",
            "prefsLanguageAuto": "自動",
            "prefsLanguageEn": "English",
            "prefsLanguageZhCN": "简体中文",
            "prefsLanguageZhTW": "繁體中文",
            "prefsOpenInBg": "新連結在背景分頁開啟",
            "prefsOpenInBgHint": "實驗性 · 需要 Tampermonkey",
            "prefsOpenInBgUnavailable": "目前的腳本管理器不支援 GM_openInTab",
            "aboutVersion": "版本",
            "aboutHomepage": "GitHub",
            "aboutGreasyFork": "Greasy Fork",
            "addToWhitelist": "加入白名單",
            "removeFromWhitelist": "移出白名單",
            "manageWhitelist": "管理白名單",
            "openSettings": "開啟設定",
            "welcomeToast": "歡迎使用 Open In New Tab！點擊此處了解更多。"
        }
    }
// __I18N_END__

    /**
     * Get text by language. Defaults to user-effective language (which may be
     * a manual override; "auto" falls back to navigator.language).
     * @param {string} key Text key
     * @param {string} [lang] Optional explicit language override
     * @returns {string} Localized text
     */
    function getText(key, lang = null) {
        const language = lang || getEffectiveLanguage()
        return (
            languageResources[language]?.[key] ||
            languageResources.en[key] ||
            key
        )
    }

    /**
     * Detect if the OS / browser prefers dark color scheme.
     * Used as the underlying probe for `getEffectiveTheme()` when user
     * setting is "auto".
     * @returns {boolean} True if in dark mode
     */
    function isDarkMode() {
        return (
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
        )
    }

    /**
     * Get theme color tokens for the user-effective theme.
     *
     * MIRROR: shared/STYLE_TOKENS.md — the values below are kept in sync with
     * `extension/popup.css`'s three theme blocks (`:root`,
     * `@media (prefers-color-scheme: dark)`, and the two manual
     * `body[style*="color-scheme: …"]` overrides). Keys are the camelCase
     * forms of the CSS variable names so a future shared/core extraction is
     * a mechanical rename. When changing a value here, update STYLE_TOKENS.md
     * and popup.css in the same commit.
     *
     * @returns {{
     *   colorScheme: "light" | "dark",
     *   bgPrimary: string, bgSecondary: string,
     *   textPrimary: string, textSecondary: string,
     *   borderColor: string, shadowColor: string, shadowHover: string,
     *   inputBg: string, inputBorder: string, inputText: string,
     *   accent: string, accentHover: string, accentFg: string,
     *   danger: string, dangerFg: string,
     * }}
     */
    function getThemeColors() {
        const isDark = getEffectiveTheme() === "dark"
        return {
            // Hint native form widgets (radios, checkboxes, scrollbars) which
            // theme to render in. Without this the host page's `color-scheme`
            // bleeds through and unselected radios show as solid black dots
            // on a light modal (or white on dark).
            colorScheme: isDark ? "dark" : "light",
            // Neutrals
            bgPrimary: isDark ? "#1a1a1a" : "#ffffff",
            bgSecondary: isDark ? "#2d2d2d" : "#f8f9fa",
            textPrimary: isDark ? "#ffffff" : "#333333",
            textSecondary: isDark ? "#cccccc" : "#666666",
            borderColor: isDark ? "#404040" : "#dddddd",
            shadowColor: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)",
            shadowHover: isDark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)",
            inputBg: isDark ? "#333333" : "#ffffff",
            inputBorder: isDark ? "#555555" : "#dddddd",
            inputText: isDark ? "#ffffff" : "#333333",
            // Accent · single teal, shared with extension and website
            accent: isDark ? "#2dd4bf" : "#0d9488",
            accentHover: isDark ? "#5eead4" : "#0f766e",
            accentFg: isDark ? "#0a0a0a" : "#ffffff",
            // Danger · only consumed by toast.error
            danger: isDark ? "#ef4444" : "#dc2626",
            dangerFg: "#ffffff",
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Toast: non-blocking notifications (replaces alert() calls)
    // ─────────────────────────────────────────────────────────────

    const TOAST_MAX_VISIBLE = 3
    const TOAST_DEFAULT_DURATION = 3000

    /**
     * Lazily create the singleton toast container and attach to document.body.
     * Returns null if body is not yet available (caller falls back to console).
     * @returns {HTMLElement|null}
     */
    function ensureToastContainer() {
        if (state.toastContainer && state.toastContainer.isConnected) {
            return state.toastContainer
        }
        if (!document.body) return null

        const container = document.createElement("div")
        container.className = "oint-toast-container"
        container.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
        `
        document.body.appendChild(container)
        state.toastContainer = container
        return container
    }

    /**
     * Smoothly remove a toast: fade-out via inline transition, then detach.
     * @param {HTMLElement} toast
     */
    function dismissToast(toast) {
        if (!toast || toast.dataset.dismissing === "1") return
        toast.dataset.dismissing = "1"
        toast.style.opacity = "0"
        toast.style.transform = "translateX(8px)"
        setTimeout(() => {
            toast.remove()
            state.toasts = state.toasts.filter((t) => t !== toast)
        }, 200)
    }

    /**
     * Show a non-blocking toast. Idempotent w.r.t. container creation.
     * Falls back to console.info when DOM isn't ready (e.g., document_start).
     * @param {string} message
     * @param {"success"|"info"|"error"} [type="info"]
     * @param {{ duration?: number, onClick?: () => void }} [opts]
     */
    function showToast(message, type = "info", opts = {}) {
        const container = ensureToastContainer()
        if (!container) {
            console.info(`[OpenInNewTab] ${message}`)
            return
        }

        // Cap visible toasts: dismiss the oldest non-dismissing one first.
        while (state.toasts.length >= TOAST_MAX_VISIBLE) {
            dismissToast(state.toasts[0])
            // Splice handled by dismissToast async; defensive break to avoid loop.
            break
        }

        const colors = getThemeColors()
        // Map toast type → accent stripe colour. Mirrors the extension's
        // popup.js notification semantics: success uses the brand accent,
        // info stays neutral (no orange "warning" tint), error uses the
        // restrained danger red defined in shared/STYLE_TOKENS.md.
        const accent =
            type === "success"
                ? colors.accent
                : type === "error"
                ? colors.danger
                : colors.textSecondary

        const toast = document.createElement("div")
        toast.className = `oint-toast oint-toast--${type}`
        toast.style.cssText = `
            min-width: 220px;
            max-width: 360px;
            padding: 12px 16px;
            border-radius: 8px;
            background: ${colors.bgPrimary};
            color: ${colors.textPrimary};
            border: 1px solid ${colors.borderColor};
            border-left: 4px solid ${accent};
            box-shadow: 0 4px 16px ${colors.shadowColor};
            font-size: 13px;
            line-height: 1.5;
            opacity: 0;
            transform: translateX(8px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: auto;
            cursor: ${opts.onClick ? "pointer" : "default"};
            word-break: break-word;
        `
        toast.textContent = message
        container.appendChild(toast)
        state.toasts.push(toast)

        // Trigger transition on next frame.
        requestAnimationFrame(() => {
            toast.style.opacity = "1"
            toast.style.transform = "translateX(0)"
        })

        if (opts.onClick) {
            toast.addEventListener("click", () => {
                try {
                    opts.onClick()
                } finally {
                    dismissToast(toast)
                }
            })
        }

        const duration = opts.duration ?? TOAST_DEFAULT_DURATION
        if (duration > 0) {
            setTimeout(() => dismissToast(toast), duration)
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Settings modal: Whitelist · Preferences · About
    // Single-shell, fully re-renderable body. All theme/language changes
    // route through `rerenderModalIfOpen()`.
    // ─────────────────────────────────────────────────────────────

    /**
     * Escape a string for safe inclusion as HTML text or attribute value.
     * @param {*} input
     * @returns {string}
     */
    function escapeHtml(input) {
        return String(input ?? "").replace(/[&<>"']/g, (c) => {
            switch (c) {
                case "&":
                    return "&amp;"
                case "<":
                    return "&lt;"
                case ">":
                    return "&gt;"
                case '"':
                    return "&quot;"
                case "'":
                    return "&#39;"
                default:
                    return c
            }
        })
    }

    /**
     * Create the modal shell once. Body is left empty here — populated by
     * `renderModalBody()` so re-skinning on theme/language change is uniform.
     * @returns {HTMLElement}
     */
    function createSettingsModal() {
        const modal = document.createElement("div")
        modal.className = "openinnewtabs-modal"
        modal.innerHTML = `
            <div class="openinnewtabs-modal-content">
                <div class="openinnewtabs-modal-header">
                    <h3 class="openinnewtabs-modal-title"></h3>
                    <button class="openinnewtabs-close" type="button" aria-label="Close">×</button>
                </div>
                <div class="openinnewtabs-modal-body"></div>
            </div>
        `
        document.body.appendChild(modal)

        // Persistent close behaviour (does not depend on body content).
        modal
            .querySelector(".openinnewtabs-close")
            .addEventListener("click", () => {
                modal.style.display = "none"
            })
        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.style.display = "none"
        })

        return modal
    }

    /**
     * Render the entire modal body and re-skin the chrome. Idempotent — call
     * this whenever theme/language/whitelist/settings change while modal open.
     * @param {HTMLElement} modal
     */
    function renderModalBody(modal) {
        const lang = getEffectiveLanguage()
        const colors = getThemeColors()
        const settings = state.settings
        const caps = state.caps

        // Re-skin shell every render (theme switch must take effect immediately).
        modal.style.cssText = `
            display: ${modal.style.display || "none"};
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            z-index: 2147483646;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
        `

        const content = modal.querySelector(".openinnewtabs-modal-content")
        content.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: ${colors.bgPrimary};
            width: 92%;
            max-width: 560px;
            max-height: 86vh;
            overflow-y: auto;
            border-radius: 12px;
            box-shadow: 0 8px 32px ${colors.shadowColor};
            border: 1px solid ${colors.borderColor};
            color-scheme: ${colors.colorScheme};
            accent-color: ${colors.accent};
        `

        const header = modal.querySelector(".openinnewtabs-modal-header")
        header.style.cssText = `
            padding: 18px 24px;
            border-bottom: 1px solid ${colors.borderColor};
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: ${colors.bgSecondary};
            border-radius: 12px 12px 0 0;
            position: sticky;
            top: 0;
            z-index: 1;
        `

        const title = modal.querySelector(".openinnewtabs-modal-title")
        title.textContent = getText("settingsTitle", lang)
        title.style.cssText = `
            margin: 0;
            color: ${colors.textPrimary};
            font-size: 17px;
            font-weight: 600;
        `

        const closeBtn = modal.querySelector(".openinnewtabs-close")
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 26px;
            cursor: pointer;
            color: ${colors.textSecondary};
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s ease, color 0.2s ease;
        `

        const body = modal.querySelector(".openinnewtabs-modal-body")
        body.style.cssText = `
            padding: 8px 24px 24px;
            color: ${colors.textPrimary};
        `

        const sectionStyle = `margin-top: 20px;`
        const sectionHeadingStyle = `
            margin: 0 0 12px;
            font-size: 13px;
            font-weight: 600;
            color: ${colors.textSecondary};
            text-transform: uppercase;
            letter-spacing: 0.06em;
        `
        // Inline style snippets — kept declarative + theme-aware. All values
        // come from `colors` so the modal re-skins on every theme/language
        // change. No gradients, no colour-tinted shadows, no transform-based
        // hover (per shared/STYLE_TOKENS.md and extension/STYLE_GUIDE.md).
        const inputStyle = `
            flex: 1;
            padding: 10px 14px;
            border: 1px solid ${colors.inputBorder};
            border-radius: 8px;
            font-size: 14px;
            background: ${colors.inputBg};
            color: ${colors.inputText};
            outline: none;
            transition: border-color 0.2s ease;
        `
        // Primary action: flat accent fill; foreground is accent-fg (NOT
        // hardcoded white, see STYLE_TOKENS.md §1.1 critical note).
        const primaryBtnStyle = `
            padding: 10px 18px;
            background: ${colors.accent};
            color: ${colors.accentFg};
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: background-color 0.2s ease, color 0.2s ease;
        `
        // Secondary action (Import / Export): ghost — transparent fill,
        // 1px neutral border, secondary text colour.
        const secondaryBtnStyle = `
            padding: 8px 14px;
            background: transparent;
            color: ${colors.textSecondary};
            border: 1px solid ${colors.borderColor};
            border-radius: 8px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
        `
        const prefRowStyle = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 0;
            border-bottom: 1px dashed ${colors.borderColor};
        `

        body.innerHTML = `
            <section class="oint-section oint-section--whitelist" style="${sectionStyle}">
                <h4 style="${sectionHeadingStyle}">${escapeHtml(
            getText("sectionWhitelist", lang)
        )}</h4>
                <div class="openinnewtabs-input-group" style="display:flex; gap:10px; margin-bottom:14px;">
                    <input type="text" id="openinnewtabs-new-domain"
                           placeholder="${escapeHtml(
                               getText("inputPlaceholder", lang)
                           )}"
                           style="${inputStyle}">
                    <button id="openinnewtabs-add-domain" type="button" style="${primaryBtnStyle}">${escapeHtml(
            getText("addButton", lang)
        )}</button>
                </div>
                <div class="oint-io-row" style="display:flex; gap:8px; margin-bottom:14px;">
                    <button id="oint-export-btn" type="button" style="${secondaryBtnStyle}">${escapeHtml(
            getText("exportButton", lang)
        )}</button>
                    <button id="oint-import-btn" type="button" style="${secondaryBtnStyle}">${escapeHtml(
            getText("importButton", lang)
        )}</button>
                </div>
                <div class="openinnewtabs-domains-list" id="openinnewtabs-domains-list"></div>
            </section>

            <section class="oint-section oint-section--prefs" style="${sectionStyle}">
                <h4 style="${sectionHeadingStyle}">${escapeHtml(
            getText("sectionPreferences", lang)
        )}</h4>

                <div class="oint-pref-row" style="${prefRowStyle}">
                    <label style="font-size:13px; font-weight:500; color:${
                        colors.textPrimary
                    };">${escapeHtml(getText("prefsTheme", lang))}</label>
                    <div class="oint-radio-group" data-pref="theme">
                        ${renderRadioGroup("theme", settings.theme, [
                            ["auto", getText("prefsThemeAuto", lang)],
                            ["light", getText("prefsThemeLight", lang)],
                            ["dark", getText("prefsThemeDark", lang)],
                        ])}
                    </div>
                </div>

                <div class="oint-pref-row" style="${prefRowStyle}">
                    <label style="font-size:13px; font-weight:500; color:${
                        colors.textPrimary
                    };">${escapeHtml(getText("prefsLanguage", lang))}</label>
                    <div class="oint-radio-group" data-pref="language">
                        ${renderRadioGroup("language", settings.language, [
                            ["auto", getText("prefsLanguageAuto", lang)],
                            ["en", getText("prefsLanguageEn", lang)],
                            ["zh-CN", getText("prefsLanguageZhCN", lang)],
                            ["zh-TW", getText("prefsLanguageZhTW", lang)],
                        ])}
                    </div>
                </div>

                <div class="oint-pref-row" style="${prefRowStyle} border-bottom: none;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:${
                        colors.textPrimary
                    }; cursor:${caps.canOpenInTab ? "pointer" : "not-allowed"};">
                        <input type="checkbox" id="oint-bg-toggle" ${
                            settings.openInBackground ? "checked" : ""
                        } ${caps.canOpenInTab ? "" : "disabled"}>
                        <span>${escapeHtml(getText("prefsOpenInBg", lang))}</span>
                    </label>
                    <small style="color:${colors.textSecondary}; font-size:11px;">${escapeHtml(
            caps.canOpenInTab
                ? getText("prefsOpenInBgHint", lang)
                : getText("prefsOpenInBgUnavailable", lang)
        )}</small>
                </div>
            </section>

            <section class="oint-section oint-section--about" style="${sectionStyle} padding-bottom: 4px;">
                <h4 style="${sectionHeadingStyle}">${escapeHtml(
            getText("sectionAbout", lang)
        )}</h4>
                <p style="margin:6px 0; font-size:13px; color:${
                    colors.textSecondary
                };">${escapeHtml(getText("aboutVersion", lang))}: ${escapeHtml(
            SCRIPT_VERSION
        )}</p>
                <p style="margin:6px 0; font-size:13px;">
                    <a href="${escapeHtml(
                        PROJECT_HOME
                    )}" target="_blank" rel="noopener noreferrer"
                       style="color:${colors.accent}; text-decoration:none;">${escapeHtml(
            getText("aboutHomepage", lang)
        )}</a>
                    <span style="color:${
                        colors.textSecondary
                    }; margin: 0 8px;">·</span>
                    <a href="${escapeHtml(
                        getGreasyForkUrl()
                    )}" target="_blank" rel="noopener noreferrer"
                       style="color:${colors.accent}; text-decoration:none;">${escapeHtml(
            getText("aboutGreasyFork", lang)
        )}</a>
                </p>
            </section>
        `

        renderWhitelistList(modal)
        bindWhitelistSection(modal)
        bindPreferencesSection(modal)
    }

    /**
     * Render a single radio-group's HTML.
     * @param {string} name Pref name (used as `oint-${name}` for radio name attr)
     * @param {string} currentValue
     * @param {Array<[string, string]>} options [value, label] pairs
     * @returns {string}
     */
    function renderRadioGroup(name, currentValue, options) {
        return options
            .map(
                ([value, label]) => `
                <label style="margin-right: 18px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size:13px;">
                    <input type="radio" name="oint-${escapeHtml(
                        name
                    )}" value="${escapeHtml(value)}" ${
                    currentValue === value ? "checked" : ""
                }>
                    <span>${escapeHtml(label)}</span>
                </label>
            `
            )
            .join("")
    }

    /**
     * Render only the whitelist list (cheaper than full body rerender).
     * @param {HTMLElement} modal
     */
    function renderWhitelistList(modal) {
        const domainsList = modal.querySelector("#openinnewtabs-domains-list")
        if (!domainsList) return
        const userWhitelist = getUserWhitelist()
        const colors = getThemeColors()
        const lang = getEffectiveLanguage()

        if (userWhitelist.length === 0) {
            domainsList.innerHTML = `
                <div style="
                    text-align: center;
                    color: ${colors.textSecondary};
                    font-size: 13px;
                    padding: 28px 16px;
                    border: 1px dashed ${colors.borderColor};
                    border-radius: 8px;
                ">${escapeHtml(getText("noDomains", lang))}</div>
            `
            return
        }

        domainsList.innerHTML = userWhitelist
            .map(
                (domain) => `
            <div class="openinnewtabs-domain-item" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 14px;
                border: 1px solid ${colors.borderColor};
                margin-bottom: 6px;
                border-radius: 8px;
                background: ${colors.bgSecondary};
            ">
                <span style="color:${
                    colors.textPrimary
                }; font-size:13px; font-weight:500; flex:1; word-break:break-all;">${escapeHtml(
                    domain
                )}</span>
                <button class="openinnewtabs-remove-domain" data-domain="${escapeHtml(
                    domain
                )}" type="button" style="
                    background: transparent;
                    color: ${colors.textSecondary};
                    border: 1px solid ${colors.borderColor};
                    border-radius: 6px;
                    padding: 6px 14px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                    transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
                ">${escapeHtml(getText("removeButton", lang))}</button>
            </div>
        `
            )
            .join("")

        domainsList
            .querySelectorAll(".openinnewtabs-remove-domain")
            .forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    const domain =
                        e.currentTarget.getAttribute("data-domain") || ""
                    removeDomainFromWhitelist(domain)
                })
            })
    }

    /**
     * Wire up the Whitelist section (add input, add button, import/export).
     * @param {HTMLElement} modal
     */
    function bindWhitelistSection(modal) {
        const input = modal.querySelector("#openinnewtabs-new-domain")
        const addBtn = modal.querySelector("#openinnewtabs-add-domain")
        if (input && addBtn) {
            const submit = () => {
                const v = input.value.trim()
                if (!v) return
                addDomainToWhitelist(v)
                input.value = ""
            }
            addBtn.addEventListener("click", submit)
            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") submit()
            })
        }

        const exportBtn = modal.querySelector("#oint-export-btn")
        const importBtn = modal.querySelector("#oint-import-btn")
        if (exportBtn) exportBtn.addEventListener("click", exportWhitelist)
        if (importBtn) importBtn.addEventListener("click", importWhitelist)
    }

    /**
     * Wire up the Preferences section radios + checkbox.
     * @param {HTMLElement} modal
     */
    function bindPreferencesSection(modal) {
        modal
            .querySelectorAll('input[name="oint-theme"]')
            .forEach((radio) => {
                radio.addEventListener("change", (e) => {
                    saveSetting(STORAGE_KEY_THEME, e.target.value)
                    rerenderModalIfOpen()
                })
            })
        modal
            .querySelectorAll('input[name="oint-language"]')
            .forEach((radio) => {
                radio.addEventListener("change", (e) => {
                    saveSetting(STORAGE_KEY_LANGUAGE, e.target.value)
                    refreshMenu()
                    rerenderModalIfOpen()
                })
            })
        const bgToggle = modal.querySelector("#oint-bg-toggle")
        if (bgToggle) {
            bgToggle.addEventListener("change", (e) => {
                saveSetting(STORAGE_KEY_OPEN_IN_BG, e.target.checked)
            })
        }
    }

    /**
     * Add domain to whitelist
     * @param {string} domain Domain to add
     */
    function addDomainToWhitelist(domain) {
        const userWhitelist = getUserWhitelist()

        if (!userWhitelist.includes(domain)) {
            userWhitelist.push(domain)
            saveUserWhitelist(userWhitelist)
            showToast(`${domain} — ${getText("addedToWhitelist")}`, "success")
        } else {
            showToast(`${domain} — ${getText("alreadyInWhitelist")}`, "info")
        }
    }

    /**
     * Remove domain from whitelist
     * @param {string} domain Domain to remove
     */
    function removeDomainFromWhitelist(domain) {
        const userWhitelist = getUserWhitelist()
        const index = userWhitelist.indexOf(domain)

        if (index > -1) {
            userWhitelist.splice(index, 1)
            saveUserWhitelist(userWhitelist)
            showToast(
                `${domain} — ${getText("removedFromWhitelist")}`,
                "success"
            )
            updateWhitelistDisplay()
        }
    }

    /**
     * Whitelist-only refresh hook used by storage listener (cheap path).
     */
    function updateWhitelistDisplay() {
        const modal = document.querySelector(".openinnewtabs-modal")
        if (modal && modal.style.display !== "none") {
            renderWhitelistList(modal)
        }
    }

    /**
     * Full modal rebuild used when settings (theme/language/bg) change.
     */
    function rerenderModalIfOpen() {
        const modal = document.querySelector(".openinnewtabs-modal")
        if (modal && modal.style.display !== "none") {
            renderModalBody(modal)
        }
    }

    /**
     * Open the settings modal — public entry point used by Tampermonkey menu.
     */
    function openSettings() {
        let modal = document.querySelector(".openinnewtabs-modal")
        if (!modal) modal = createSettingsModal()
        modal.style.display = "block"
        renderModalBody(modal)
    }

    // ─────────────────────────────────────────────────────────────
    // JSON import / export
    //   Export payload schema:
    //     { "version": 1, "exportedAt": "<ISO>", "domains": ["..."] }
    //   Import accepts:
    //     - this object,
    //     - a bare string[] (legacy / hand-written),
    //     - any object whose `domains` field is a string[]
    // ─────────────────────────────────────────────────────────────

    const EXPORT_SCHEMA_VERSION = 1

    /**
     * Lightweight domain validator. Liberal on purpose — accepts any non-empty
     * string with no whitespace and reasonable length. Strips an accidental
     * `https?://` prefix and trailing slash to be forgiving on paste.
     * @param {*} raw
     * @returns {string|null} normalized domain or null when invalid
     */
    function normalizeDomainEntry(raw) {
        if (typeof raw !== "string") return null
        let v = raw.trim().toLowerCase()
        if (!v) return null
        v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
        if (/\s/.test(v)) return null
        if (v.length > 253) return null
        if (!/^[a-z0-9.-]+$/i.test(v)) return null
        return v
    }

    /**
     * Build today's filename slug (YYYYMMDD).
     * @returns {string}
     */
    function isoDateSlug() {
        const d = new Date()
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, "0")
        const dd = String(d.getDate()).padStart(2, "0")
        return `${yyyy}${mm}${dd}`
    }

    /**
     * Trigger a download of the current whitelist as a JSON file.
     */
    function exportWhitelist() {
        try {
            const domains = getUserWhitelist()
            const payload = {
                version: EXPORT_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                domains,
            }
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: "application/json",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `open-in-new-tab-whitelist-${isoDateSlug()}.json`
            document.body.appendChild(a)
            a.click()
            a.remove()
            // Defer revoke so the click navigation has a chance to start.
            setTimeout(() => URL.revokeObjectURL(url), 1000)
            showToast(getText("exportSuccess"), "success")
        } catch (e) {
            console.warn("[OpenInNewTab] export failed:", e)
            showToast(getText("exportFailed"), "error")
        }
    }

    /**
     * Extract a string[] of domains from the parsed payload, accepting all
     * supported formats. Returns [] when no recognizable shape is found.
     * @param {*} parsed
     * @returns {string[]}
     */
    function extractDomainsFromPayload(parsed) {
        if (Array.isArray(parsed)) return parsed
        if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.domains)) return parsed.domains
            if (Array.isArray(parsed.userWhitelist))
                return parsed.userWhitelist
            if (Array.isArray(parsed.whitelist)) return parsed.whitelist
        }
        return []
    }

    /**
     * Open a file picker, parse the chosen JSON file, and merge or replace
     * the current whitelist depending on user choice (native confirm).
     */
    function importWhitelist() {
        const input = document.createElement("input")
        input.type = "file"
        input.accept = "application/json,.json"
        input.style.display = "none"
        document.body.appendChild(input)

        input.addEventListener("change", () => {
            const file = input.files && input.files[0]
            input.remove()
            if (!file) return

            const reader = new FileReader()
            reader.onerror = () => {
                showToast(getText("importInvalidJson"), "error")
            }
            reader.onload = () => {
                let parsed
                try {
                    parsed = JSON.parse(String(reader.result || ""))
                } catch (e) {
                    console.warn("[OpenInNewTab] import parse failed:", e)
                    showToast(getText("importInvalidJson"), "error")
                    return
                }

                const raw = extractDomainsFromPayload(parsed)
                if (!Array.isArray(raw) || raw.length === 0) {
                    showToast(getText("importEmpty"), "error")
                    return
                }

                // Normalize + dedupe within the imported list itself.
                const seen = new Set()
                const valid = []
                let invalidCount = 0
                for (const item of raw) {
                    const norm = normalizeDomainEntry(item)
                    if (!norm) {
                        invalidCount++
                        continue
                    }
                    if (seen.has(norm)) continue
                    seen.add(norm)
                    valid.push(norm)
                }
                if (valid.length === 0) {
                    showToast(getText("importEmpty"), "error")
                    return
                }

                // Merge vs replace — synchronous confirm keeps it simple.
                const mergeChosen = window.confirm(
                    getText("importMergeOrReplace")
                )
                const current = getUserWhitelist()

                if (mergeChosen) {
                    const existing = new Set(current)
                    let added = 0
                    for (const d of valid) {
                        if (!existing.has(d)) {
                            existing.add(d)
                            current.push(d)
                            added++
                        }
                    }
                    saveUserWhitelist(current)
                    showToast(
                        getText("importDoneMerge")
                            .replace("{added}", String(added))
                            .replace(
                                "{skipped}",
                                String(valid.length - added + invalidCount)
                            ),
                        "success",
                        { duration: 5000 }
                    )
                } else {
                    saveUserWhitelist(valid)
                    showToast(
                        getText("importDoneReplace")
                            .replace("{total}", String(valid.length))
                            .replace("{skipped}", String(invalidCount)),
                        "success",
                        { duration: 5000 }
                    )
                }
            }
            reader.readAsText(file)
        })

        input.click()
    }

    // ─────────────────────────────────────────────────────────────
    // Core: link interception + target patching + page lifecycle
    // MIRROR: extension/content.js
    //   Diffs vs extension:
    //     - openInBackground 不支持，统一走 window.open
    //     - 用 GM_* 替代 chrome.storage / chrome.runtime
    //     - 跨 tab reload 不可行，由 GM_addValueChangeListener 在每页本地等价
    // Keep in sync when extension version changes.
    // ─────────────────────────────────────────────────────────────

    /**
     * Decide whether a click should bypass our interception.
     * MIRROR: extension/content.js#shouldSkipLinkClick
     * @param {MouseEvent} event
     * @param {HTMLAnchorElement} link
     * @returns {boolean}
     */
    function shouldSkipLinkClick(event, link) {
        if (link.hasAttribute("download")) return true

        if (
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.button === 1
        ) {
            return true
        }

        const href = link.getAttribute("href")
        if (
            !href ||
            href.startsWith("javascript:") ||
            href.startsWith("mailto:") ||
            href.startsWith("tel:") ||
            href.startsWith("#")
        ) {
            return true
        }

        return false
    }

    /**
     * Capture-phase click handler. Synchronous so the new-tab call stays in
     * the user-gesture stack (popup blockers won't fire).
     * Background-tab opening (when enabled & supported) goes through
     * `GM_openInTab` with `active: false`; otherwise we fall back to the
     * native `window.open` foreground-tab behaviour.
     * @param {MouseEvent} event
     */
    function handleLinkClick(event) {
        const target = event.target
        if (!target || typeof target.closest !== "function") return
        const link = target.closest("a[href]")
        if (!link || shouldSkipLinkClick(event, link)) return

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()

        if (state.caps.canOpenInTab && state.settings.openInBackground) {
            try {
                GM_openInTab(link.href, {
                    active: false,
                    insert: true,
                    setParent: true,
                })
                return
            } catch (e) {
                console.warn(
                    "[OpenInNewTab] GM_openInTab failed, falling back to window.open:",
                    e
                )
            }
        }

        window.open(link.href, "_blank", "noopener,noreferrer")
    }

    /**
     * Patch a single anchor with target=_blank + safe rel, marked for rollback.
     * MIRROR: extension/content.js#patchLinkTarget
     * @param {HTMLAnchorElement} link
     */
    function patchLinkTarget(link) {
        if (
            link.target ||
            link.hasAttribute("download") ||
            link.hasAttribute(PATCHED_ATTR)
        ) {
            return
        }
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.setAttribute(PATCHED_ATTR, "1")
    }

    /**
     * Walk a subtree and patch every anchor descendant.
     * @param {Node} root
     */
    function patchLinksUnder(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return
        if (root.matches?.("a[href]")) patchLinkTarget(root)
        root.querySelectorAll?.("a[href]").forEach(patchLinkTarget)
    }

    /**
     * Roll back all anchors we previously patched.
     * MIRROR: extension/content.js#removePatchedTargets
     */
    function removePatchedTargets() {
        document.querySelectorAll(`a[${PATCHED_ATTR}]`).forEach((link) => {
            link.removeAttribute("target")
            link.removeAttribute("rel")
            link.removeAttribute(PATCHED_ATTR)
        })
    }

    /** Idle-batched flush for collected mutations. */
    function flushPendingPatches() {
        state.scheduled = false
        const batch = state.pendingNodes
        state.pendingNodes = []
        for (const node of batch) patchLinksUnder(node)
    }

    function schedulePatchFlush() {
        if (state.scheduled) return
        state.scheduled = true
        if (typeof requestIdleCallback === "function") {
            requestIdleCallback(flushPendingPatches, { timeout: 200 })
        } else {
            setTimeout(flushPendingPatches, 0)
        }
    }

    function startObserver() {
        if (state.observer || !document.body) return
        state.observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === "childList") {
                    m.addedNodes.forEach((n) => state.pendingNodes.push(n))
                } else if (
                    m.type === "attributes" &&
                    m.target.nodeType === Node.ELEMENT_NODE &&
                    m.target.matches?.("a[href]")
                ) {
                    state.pendingNodes.push(m.target)
                }
            }
            schedulePatchFlush()
        })
        state.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["href"],
        })
    }

    function stopObserver() {
        if (state.observer) {
            state.observer.disconnect()
            state.observer = null
        }
        state.pendingNodes = []
        state.scheduled = false
    }

    /**
     * Mount or unmount the page-level integration based on current whitelist hit.
     * Idempotent — safe to call repeatedly (init, storage change, menu action).
     */
    function applyToCurrentPage() {
        const shouldApply = isWhitelisted()

        if (shouldApply && !state.isApplied) {
            // Click capture works without DOM ready, bind ASAP.
            document.addEventListener("click", handleLinkClick, true)

            const onBodyReady = () => {
                if (!state.isApplied) return
                patchLinksUnder(document.body)
                startObserver()
            }
            if (document.body) {
                onBodyReady()
            } else {
                document.addEventListener("DOMContentLoaded", onBodyReady, {
                    once: true,
                })
            }

            state.isApplied = true
            return
        }

        if (!shouldApply && state.isApplied) {
            document.removeEventListener("click", handleLinkClick, true)
            stopObserver()
            removePatchedTargets()
            state.isApplied = false
        }
    }

    /**
     * Re-register tampermonkey menu commands so the visible label reflects
     * current whitelist status. Falls back gracefully when
     * GM_unregisterMenuCommand is unavailable (registers both add+remove).
     */
    function refreshMenu() {
        const lang = getEffectiveLanguage()
        const canUnregister = state.caps.canUnregisterMenu
        const inWhitelist = isWhitelisted()

        if (canUnregister) {
            for (const id of state.menuIds) {
                try {
                    GM_unregisterMenuCommand(id)
                } catch (_e) {
                    /* ignore: menu may already be cleared */
                }
            }
            state.menuIds = []

            if (inWhitelist) {
                state.menuIds.push(
                    GM_registerMenuCommand(
                        getText("removeFromWhitelist", lang),
                        removeCurrentDomainFromWhitelist
                    )
                )
            } else {
                state.menuIds.push(
                    GM_registerMenuCommand(
                        getText("addToWhitelist", lang),
                        addCurrentDomainToWhitelist
                    )
                )
            }
            state.menuIds.push(
                GM_registerMenuCommand(
                    getText("openSettings", lang),
                    openSettings
                )
            )
            return
        }

        // Fallback: legacy managers without unregister support — set once.
        if (state.menuIds.length === 0) {
            state.menuIds.push(
                GM_registerMenuCommand(
                    getText("addToWhitelist", lang),
                    addCurrentDomainToWhitelist
                ),
                GM_registerMenuCommand(
                    getText("removeFromWhitelist", lang),
                    removeCurrentDomainFromWhitelist
                ),
                GM_registerMenuCommand(
                    getText("openSettings", lang),
                    openSettings
                )
            )
        }
    }

    /**
     * Bridge GM storage changes to in-page reactions.
     * Cross-tab updates arrive with `remote === true`; same-tab saves arrive
     * with `remote === false`. Both should re-evaluate page state and menu.
     */
    function setupStorageListener() {
        if (!state.caps.canListenStorage) return

        const safeAdd = (key, cb) => {
            try {
                state.listenerIds.push(GM_addValueChangeListener(key, cb))
            } catch (e) {
                console.warn(
                    `[OpenInNewTab] storage listener for "${key}" failed:`,
                    e
                )
            }
        }

        // Whitelist drives interception lifecycle, menu label, and modal list.
        safeAdd(STORAGE_KEY_WHITELIST, () => {
            applyToCurrentPage()
            refreshMenu()
            const modal = document.querySelector(".openinnewtabs-modal")
            if (modal && modal.style.display !== "none") {
                updateWhitelistDisplay()
            }
        })

        // Settings changes only re-render UI; they do not affect interception.
        for (const key of SETTINGS_KEYS) {
            safeAdd(key, (_name, _old, value) => {
                if (key === STORAGE_KEY_THEME) state.settings.theme = value
                else if (key === STORAGE_KEY_LANGUAGE)
                    state.settings.language = value
                else if (key === STORAGE_KEY_OPEN_IN_BG)
                    state.settings.openInBackground = Boolean(value)
                refreshMenu()
                rerenderModalIfOpen()
            })
        }
    }

    /**
     * Two-factor first-run sentinel:
     *   - If `__installed_at` is missing AND whitelist is empty → genuine
     *     first run: stamp time + open welcome page (or degrade to toast).
     *   - If `__installed_at` is missing BUT whitelist already has entries →
     *     existing v1.6.x user upgrading: silently stamp the time so future
     *     fresh installs of theirs aren't double-welcomed, but DO NOT pop
     *     anything. This avoids unwanted disruption.
     */
    function maybeShowWelcome() {
        const installedAt = GM_getValue(STORAGE_KEY_INSTALLED_AT, null)
        if (installedAt) return // Already greeted at some point.

        const now = Date.now()
        const userWhitelist = getUserWhitelist()

        // Always stamp first to make this idempotent across racy re-inits.
        GM_setValue(STORAGE_KEY_INSTALLED_AT, now)

        if (userWhitelist.length > 0) {
            // Returning user upgrading from a pre-1.7 install — stay quiet.
            return
        }

        // Genuine first install — best-effort welcome.
        if (state.caps.canOpenInTab) {
            try {
                GM_openInTab(WELCOME_URL, {
                    active: true,
                    insert: true,
                    setParent: true,
                })
                return
            } catch (e) {
                console.warn(
                    "[OpenInNewTab] welcome page open failed, degrading to toast:",
                    e
                )
            }
        }

        // Degraded path: a long-lived clickable toast.
        showToast(getText("welcomeToast"), "info", {
            duration: 8000,
            onClick: () => {
                window.open(WELCOME_URL, "_blank", "noopener,noreferrer")
            },
        })
    }

    /** Entry point. */
    function initialize() {
        try {
            detectCaps()
            loadSettings()
            refreshMenu()
            applyToCurrentPage()
            setupStorageListener()

            // Defer welcome until body is ready so the toast fallback works.
            if (document.body) {
                maybeShowWelcome()
            } else {
                document.addEventListener(
                    "DOMContentLoaded",
                    maybeShowWelcome,
                    { once: true }
                )
            }
        } catch (e) {
            console.error("[OpenInNewTab] init failed:", e)
        }
    }

    // Bind ASAP — initialize is safe to call before DOMContentLoaded.
    initialize()
})()

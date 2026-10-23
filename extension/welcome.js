/**
 * Welcome Script - Open In New Tab Extension
 * Shown once on first install. Mirrors the options page i18n/theme handling.
 */

;(function () {
    "use strict"

    /** Shared i18n runtime (loaded via i18n-bundle.js before welcome.js). */
    const i18n = window.I18n
    let currentLanguage = i18n.DEFAULT_LOCALE

    /**
     * Get language preference from storage, falling back to browser language.
     * Legacy stored "zh" canonicalizes to "zh-CN".
     * @returns {Promise<string>} BCP-47 locale code
     */
    async function getLanguagePreference() {
        try {
            const result = await chrome.storage.sync.get(["userLanguage"])
            return i18n.resolveStoredLocale(result.userLanguage)
        } catch (error) {
            console.error("Error getting language preference:", error)
            return i18n.detectLocale()
        }
    }

    /**
     * Get theme preference from storage
     * @returns {Promise<string>} Theme preference ('light', 'dark', or 'auto')
     */
    async function getThemePreference() {
        try {
            const result = await chrome.storage.sync.get(["userTheme"])
            return result.userTheme || "auto"
        } catch (error) {
            console.error("Error getting theme preference:", error)
            return "auto"
        }
    }

    /**
     * Apply theme to document
     * @param {string} theme Theme to apply ('light', 'dark', or 'auto')
     */
    function applyTheme(theme) {
        window.OINTTheme.apply(theme)
    }

    /**
     * Get localized text by key
     * @param {string} key Text key
     * @param {Object} params Parameters to replace in text
     * @returns {string} Localized text
     */
    function getText(key, params = {}) {
        return i18n.getText(key, currentLanguage, params)
    }

    /**
     * Apply localized text to all known elements
     */
    function updateLanguage() {
        const keys = [
            "heroBadge",
            "welcomeTitle",
            "welcomeSubtitle",
            "howItWorksHeading",
            "howItWorksDesc",
            "getStartedHeading",
            "step1Title",
            "step1Desc",
            "step2Title",
            "step2Desc",
            "step3Title",
            "step3Desc",
            "openOptionsBtnText",
            "visitSiteBtnText",
        ]

        keys.forEach((key) => {
            const el = document.getElementById(key)
            if (el) {
                el.textContent = getText(key)
            }
        })

        document.getElementById("footerText").textContent = getText(
            "footerText",
            { version: chrome.runtime.getManifest().version }
        )

        document.documentElement.lang = i18n.htmlLang(currentLanguage)
    }

    /**
     * Initialize welcome page
     */
    async function initialize() {
        try {
            const theme = await getThemePreference()
            applyTheme(theme)
            window.OINTTheme.watchSystem(() => {
                if (theme === "auto") {
                    applyTheme("auto")
                }
            })
            currentLanguage = await getLanguagePreference()
            updateLanguage()

            document
                .getElementById("openOptionsBtn")
                .addEventListener("click", () => {
                    chrome.runtime.openOptionsPage()
                })
        } catch (error) {
            console.error("Error initializing welcome page:", error)
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize)
    } else {
        initialize()
    }
})()

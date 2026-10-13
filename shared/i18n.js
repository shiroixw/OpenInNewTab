/* exported createI18n */
// @ts-check
/**
 * Shared i18n runtime. `scripts/sync-locales.mjs` concatenates this after
 * `I18nLocales`. Consumers call `createI18n(I18nLocales)`.
 *
 * Locale ids are BCP-47: en, zh-CN, zh-TW.
 * Legacy stored "zh" canonicalizes to zh-CN.
 * zh-HK / zh-MO / zh-Hant* map to zh-TW; other zh* map to zh-CN.
 */

/**
 * One locale's flat `key → text` dictionary.
 * @typedef {Record<string, string>} LocalePack
 */

/**
 * Every locale, keyed by BCP-47 id.
 * @typedef {Record<string, LocalePack>} LocaleCatalog
 */

/**
 * @typedef {object} CanonicalizeOptions
 * @property {boolean} [allowAuto] Keep the literal "auto" instead of resolving it.
 */

/**
 * Build the i18n facade bound to one locale catalog.
 * @param {LocaleCatalog} [locales]
 */
function createI18n(locales) {
    "use strict"

    const DEFAULT_LOCALE = "en"
    const SUPPORTED_LOCALES = Object.freeze(["en", "zh-CN", "zh-TW"])
    const LOCALE_LABELS = Object.freeze([
        { id: "en", label: "English" },
        { id: "zh-CN", label: "简体中文" },
        { id: "zh-TW", label: "繁體中文" },
    ])
    /** @type {LocaleCatalog} */
    const catalog = locales && typeof locales === "object" ? locales : {}

    /**
     * Coerce any stored/detected value to a supported BCP-47 id.
     * Unknown or unsupported values fall back to the default locale.
     * @param {unknown} input
     * @returns {string}
     */
    function normalizeLocale(input) {
        if (input == null) {
            return DEFAULT_LOCALE
        }
        const raw = String(input).trim().replace(/_/g, "-")
        if (!raw || raw === "auto") {
            return DEFAULT_LOCALE
        }
        if (SUPPORTED_LOCALES.indexOf(raw) !== -1) {
            return raw
        }
        const lower = raw.toLowerCase()
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
        return DEFAULT_LOCALE
    }

    /**
     * Resolve a locale from an explicit hint, else the browser language.
     * @param {string} [hint]
     * @returns {string}
     */
    function detectLocale(hint) {
        const source =
            hint ||
            (typeof navigator !== "undefined" && navigator.language) ||
            DEFAULT_LOCALE
        return normalizeLocale(source)
    }

    /**
     * Resolve a stored preference, treating "auto"/empty as "follow the browser".
     * @param {unknown} [stored]
     * @returns {string}
     */
    function resolveStoredLocale(stored) {
        if (stored == null || stored === "" || stored === "auto") {
            return detectLocale()
        }
        return normalizeLocale(stored)
    }

    /**
     * Normalize a stored preference, optionally preserving the literal "auto".
     * @param {unknown} [stored]
     * @param {CanonicalizeOptions} [options]
     * @returns {string}
     */
    function canonicalizeStoredLocale(stored, options) {
        const allowAuto = Boolean(options && options.allowAuto)
        if (stored == null || stored === "") {
            return allowAuto ? "auto" : detectLocale()
        }
        if (stored === "auto") {
            return allowAuto ? "auto" : detectLocale()
        }
        return normalizeLocale(stored)
    }

    /**
     * Fill `{name}` placeholders from `params`. Unknown names are left intact.
     * @param {string} text
     * @param {Record<string, unknown>} [params]
     * @returns {string}
     */
    function interpolate(text, params) {
        if (!params) {
            return text
        }
        return String(text).replace(/\{(\w+)\}/g, function (_, name) {
            return params[name] == null ? "{" + name + "}" : String(params[name])
        })
    }

    /**
     * Look up a key in the requested locale, falling back to the default
     * locale and finally to the key itself.
     * @param {string} key
     * @param {string} [locale]
     * @param {Record<string, unknown>} [params]
     * @returns {string}
     */
    function getText(key, locale, params) {
        const resolved = normalizeLocale(locale)
        /** @type {LocalePack} */
        const pack = catalog[resolved] || catalog[DEFAULT_LOCALE] || {}
        /** @type {LocalePack} */
        const fallback = catalog[DEFAULT_LOCALE] || {}
        const text = pack[key] || fallback[key] || key
        return interpolate(text, params)
    }

    /**
     * Populate a `<select>` with every supported locale and select `current`.
     * @param {HTMLSelectElement | null} selectEl
     * @param {string} [current]
     * @returns {void}
     */
    function fillLanguageSelect(selectEl, current) {
        if (!selectEl) {
            return
        }
        const resolved = normalizeLocale(current)
        selectEl.innerHTML = LOCALE_LABELS.map(function (item) {
            return (
                '<option value="' + item.id + '">' + item.label + "</option>"
            )
        }).join("")
        selectEl.value = resolved
    }

    /**
     * @param {string} value
     * @returns {boolean}
     */
    function isSupportedLocale(value) {
        return SUPPORTED_LOCALES.indexOf(value) !== -1
    }

    /**
     * Map a locale to the Greasy Fork URL segment that has a translation.
     * @param {string} [locale]
     * @returns {string}
     */
    function greasyForkLangPrefix(locale) {
        const resolved = normalizeLocale(locale)
        if (resolved === "zh-CN" || resolved === "zh-TW") {
            return resolved
        }
        return "en"
    }

    return {
        DEFAULT_LOCALE: DEFAULT_LOCALE,
        SUPPORTED_LOCALES: SUPPORTED_LOCALES,
        LOCALE_LABELS: LOCALE_LABELS,
        locales: catalog,
        normalizeLocale: normalizeLocale,
        detectLocale: detectLocale,
        resolveStoredLocale: resolveStoredLocale,
        canonicalizeStoredLocale: canonicalizeStoredLocale,
        interpolate: interpolate,
        getText: getText,
        htmlLang: normalizeLocale,
        greasyForkLangPrefix: greasyForkLangPrefix,
        fillLanguageSelect: fillLanguageSelect,
        isSupportedLocale: isSupportedLocale,
    }
}

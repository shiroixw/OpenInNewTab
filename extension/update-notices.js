/**
 * Update notices — the release taxonomy of the extension.
 *
 * The popup reads this table to decide whether the release that is now running
 * deserves a line in its footer: `v1.8.0 · <title>` plus a link to the full
 * release notes. One line, because the popup's job is adding a domain — an
 * explanatory paragraph there is noise. Only *content* lives here; UI chrome
 * ("Dismiss", "What's new", the Settings toggle) is in
 * `shared/locales/ext/*.json` like every other string.
 *
 * Contract, enforced by `scripts/verify-release-notice.mjs` before packaging
 * and in the release workflow:
 *   - every release has an entry for its exact `manifest.version`;
 *   - `showUpdateNotice: false` = silent release, no copy needed;
 *   - `showUpdateNotice: true` = one line in the popup, so `title` is required
 *     in all three shipped locales and must stay short enough to fit one line,
 *     and the user can turn notices off in Settings.
 *
 * Add an entry per release; do not delete old ones — the table doubles as the
 * record of which versions talked to the user. A missing entry fails the build
 * on purpose: forgetting must be loud, not silent, because the releases that
 * need a note are exactly the ones someone would forget.
 *
 * Loaded as a classic script by `popup.html`, and evaluated in a `node:vm`
 * sandbox by the tests and the verify script — so: no imports, no exports.
 */

const UPDATE_NOTICES = {
    "1.8.0": {
        showUpdateNotice: true,
        en: {
            title: "Update notes are here",
        },
        "zh-CN": {
            title: "更新提示已上线",
        },
        "zh-TW": {
            title: "更新提示已上線",
        },
    },
}

/** Locales a notice must cover — mirrors `shared/i18n.js` `SUPPORTED_LOCALES`. */
const NOTICE_LOCALES = ["en", "zh-CN", "zh-TW"]

/** Copy fields every localized notice needs. */
const NOTICE_FIELDS = ["title"]

/**
 * Look up the notice for an exact version.
 * Own-property lookup only, so `toString` and friends are never notices.
 * @param {string} version
 * @returns {Record<string, any> | null}
 */
function getUpdateNotice(version) {
    if (typeof version !== "string" || version === "") {
        return null
    }
    if (!Object.prototype.hasOwnProperty.call(UPDATE_NOTICES, version)) {
        return null
    }
    const notice = UPDATE_NOTICES[version]
    if (!notice || typeof notice !== "object" || Array.isArray(notice)) {
        return null
    }
    return notice
}

/**
 * Every version that has an entry, newest-looking order preserved.
 * @returns {string[]}
 */
function listUpdateNoticeVersions() {
    return Object.keys(UPDATE_NOTICES)
}

/**
 * Pick the copy for a locale, falling back to English for anything the notice
 * does not translate.
 * @param {Record<string, any> | null} notice
 * @param {string} locale BCP-47 id, e.g. `zh-CN`
 * @returns {{ title: string } | null}
 */
function resolveNoticeCopy(notice, locale) {
    if (!notice || typeof notice !== "object") {
        return null
    }
    const candidates = [notice[locale], notice.en]
    for (const copy of candidates) {
        if (copy && typeof copy === "object" && !Array.isArray(copy)) {
            return { title: copy.title }
        }
    }
    return null
}

/**
 * Validate one notice entry.
 * @param {unknown} notice
 * @returns {string[]} Human-readable problems; empty means valid.
 */
function validateUpdateNotice(notice) {
    if (!notice || typeof notice !== "object" || Array.isArray(notice)) {
        return ["notice must be an object"]
    }

    const entry = /** @type {Record<string, any>} */ (notice)
    const errors = []

    if (typeof entry.showUpdateNotice !== "boolean") {
        errors.push("showUpdateNotice must be a boolean")
    }
    if (entry.showUpdateNotice !== true) {
        return errors
    }

    for (const locale of NOTICE_LOCALES) {
        const copy = entry[locale]
        if (!copy || typeof copy !== "object" || Array.isArray(copy)) {
            errors.push(`${locale}: missing copy`)
            continue
        }
        for (const field of NOTICE_FIELDS) {
            const value = copy[field]
            if (typeof value !== "string" || value.trim() === "") {
                errors.push(`${locale}.${field} must be a non-empty string`)
            }
        }
    }

    return errors
}

/**
 * Whether this notice is fit to show. Deliberately knows nothing about storage:
 * the user's opt-out is the caller's business.
 * @param {unknown} notice
 * @returns {boolean}
 */
function shouldShowUpdateNotice(notice) {
    return (
        !!notice &&
        /** @type {Record<string, any>} */ (notice).showUpdateNotice === true &&
        validateUpdateNotice(notice).length === 0
    )
}

globalThis.OpenInNewTabUpdateNotices = {
    getUpdateNotice,
    listUpdateNoticeVersions,
    resolveNoticeCopy,
    validateUpdateNotice,
    shouldShowUpdateNotice,
}

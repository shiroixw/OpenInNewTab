/**
 * Dev harness for the popup update note.
 *
 * Nothing here ships: the page renders the *actual* `#updateBanner` node lifted
 * out of `extension/popup.html`, and the *actual* `.options-footer` out of
 * `extension/options.html`, styled by the real `options.css` (which `@import`s
 * `popup.css`) and fed by the real `update-notices.js` + `i18n-bundle.js`. The
 * preview therefore cannot drift from production — there is no second copy of
 * the markup or the copy.
 *
 * Serve the repo root, not `dev/`, because the harness fetches `../extension/*`:
 *
 *     npx http-server . -p 8765
 *     http://127.0.0.1:8765/dev/notice-preview.html
 *
 * `fetch` needs http(s); opening this file directly will not work.
 */
;(function () {
    "use strict"

    const POPUP_HTML = "../extension/popup.html"
    const OPTIONS_HTML = "../extension/options.html"
    const MANIFEST = "../extension/manifest.json"

    /** A version no release is registered under, to preview the gate's failure. */
    const MISSING_VERSION = "0.0.0"

    const state = {
        /** The version whose entry is being previewed. */
        version: "",
        /** The running version, which the Settings footer always reports. */
        appVersion: "",
        language: "en",
        mode: "notice",
        theme: "auto",
    }

    /** @type {HTMLElement | null} */
    let banner = null
    /** @type {HTMLElement | null} */
    let footer = null

    const noticesApi = () => globalThis.OpenInNewTabUpdateNotices
    const i18n = () => globalThis.I18n
    const getText = (key, params) => i18n().getText(key, state.language, params)

    /**
     * Fetch a page and return one of its nodes, adopted into this document.
     * @param {string} url
     * @param {string} selector
     * @returns {Promise<HTMLElement>}
     */
    async function loadNode(url, selector) {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`${url} → HTTP ${response.status}`)
        }
        const doc = new DOMParser().parseFromString(
            await response.text(),
            "text/html"
        )
        const node = doc.querySelector(selector)
        if (!node) {
            throw new Error(`${selector} not found in ${url}`)
        }
        return /** @type {HTMLElement} */ (document.importNode(node, true))
    }

    /**
     * Stand-in for the popup body, so the note is judged against something.
     * Deliberately not the real header: it is sticky and would float away.
     * @returns {HTMLElement}
     */
    function mockHeader() {
        const header = document.createElement("header")
        header.className = "mock-header"
        const title = document.createElement("span")
        title.id = "mockHeaderTitle"
        header.append(title)
        return header
    }

    /**
     * @param {HTMLSelectElement} select
     * @param {Array<[string, string]>} entries
     */
    function populate(select, entries) {
        select.replaceChildren()
        for (const [value, label] of entries) {
            const option = document.createElement("option")
            option.value = value
            option.textContent = label
            select.append(option)
        }
    }

    /**
     * The entry as the popup would evaluate it in the current mode.
     * @returns {Record<string, any> | null}
     */
    function effectiveNotice() {
        const notice = noticesApi().getUpdateNotice(state.version)
        if (!notice) {
            return null
        }
        if (state.mode === "silent") {
            return { ...notice, showUpdateNotice: false }
        }
        return notice
    }

    function renderBanner() {
        const api = noticesApi()
        const notice = effectiveNotice()
        const visible = state.mode === "notice" && api.shouldShowUpdateNotice(notice)

        const copy = api.resolveNoticeCopy(notice, state.language)
        if (banner && copy) {
            banner.querySelector("#updateBannerTitle").textContent = copy.title
            banner.querySelector("#updateBannerSummary").textContent =
                copy.summary
        }
        if (banner) {
            banner.querySelector("#updateBannerLink").textContent = getText(
                "updateBannerLink"
            )
            const close = banner.querySelector("#updateBannerClose")
            close.title = getText("updateBannerDismiss")
            close.setAttribute("aria-label", getText("updateBannerDismiss"))
            banner.hidden = !visible
        }

        document.getElementById("popupNote").textContent = explain(visible)
    }

    function renderFooter() {
        if (!footer) {
            return
        }
        footer.querySelector("#footerText").textContent = getText("footerText", {
            version: state.appVersion,
        })
        footer.querySelector("#releaseNotesLink").textContent =
            getText("releaseNotesLink")
    }

    /**
     * Why the banner is or is not on screen — the same questions popup.js asks.
     * @param {boolean} visible
     * @returns {string}
     */
    function explain(visible) {
        const api = noticesApi()
        const notice = api.getUpdateNotice(state.version)

        if (!notice) {
            return `No entry for ${state.version}: the popup renders nothing, and release:check would refuse to package this build.`
        }
        if (state.mode === "dismissed") {
            return `hidden — dismissedUpdateNotice === "${state.version}". The next release gets a fresh chance.`
        }
        if (state.mode === "off") {
            return "hidden — updateNoticeEnabled === false. Only the Settings toggle turns this back on."
        }
        if (state.mode === "silent") {
            return "hidden — this release is registered as silent (showUpdateNotice: false)."
        }
        if (!visible) {
            const errors = api.validateUpdateNotice(notice)
            return `hidden — shouldShowUpdateNotice() rejected the entry: ${
                errors.join("; ") || "unknown reason"
            }`
        }
        return `shown — shouldShowUpdateNotice() accepted ${state.version}.`
    }

    function render() {
        document.getElementById("mockHeaderTitle").textContent =
            getText("modalTitle")
        renderBanner()
        renderFooter()
    }

    function applyTheme() {
        globalThis.OINTTheme.apply(state.theme)
    }

    /**
     * @param {string} currentVersion
     * @returns {Array<[string, string]>}
     */
    function versionEntries(currentVersion) {
        const others = noticesApi()
            .listUpdateNoticeVersions()
            .filter((version) => version !== currentVersion)
            .sort()
            .reverse()
            .map((version) => [version, version])

        return [
            [currentVersion, `${currentVersion} (current)`],
            ...others,
            [MISSING_VERSION, `${MISSING_VERSION} (not registered)`],
        ]
    }

    function showError(error) {
        const note = document.getElementById("popupNote")
        note.textContent = `Could not load the extension files: ${
            error instanceof Error ? error.message : error
        } — serve the repo root (npx http-server . -p 8765), not dev/.`
        note.classList.add("is-error")
    }

    async function initialize() {
        state.language = i18n().resolveStoredLocale(null)

        const manifest = await (await fetch(MANIFEST)).json()
        state.version = manifest.version
        state.appVersion = manifest.version

        banner = await loadNode(POPUP_HTML, "#updateBanner")
        footer = await loadNode(OPTIONS_HTML, ".options-footer")
        document
            .getElementById("popupFrame")
            .append(banner, mockHeader())
        document.getElementById("footerFrame").append(footer)

        const versionSelect = document.getElementById("versionSelect")
        const languageSelect = document.getElementById("languageSelect")
        const stateSelect = document.getElementById("stateSelect")
        const themeSelect = document.getElementById("themeSelect")

        populate(versionSelect, versionEntries(state.version))
        populate(
            languageSelect,
            i18n().LOCALE_LABELS.map((locale) => [locale.id, locale.label])
        )
        for (const select of [
            versionSelect,
            languageSelect,
            stateSelect,
            themeSelect,
        ]) {
            select.value = state[select.dataset.stateKey]
            select.addEventListener("change", () => {
                state[select.dataset.stateKey] = select.value
                applyTheme()
                render()
            })
        }

        banner.querySelector("#updateBannerClose").addEventListener("click", () => {
            // Preview only: no storage is touched, unlike the real popup.
            state.mode = "dismissed"
            stateSelect.value = "dismissed"
            render()
        })

        globalThis.OINTTheme.watchSystem(() => {
            if (state.theme === "auto") {
                applyTheme()
            }
        })

        applyTheme()
        render()
    }

    initialize().catch(showError)
})()

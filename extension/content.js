/**
 * Content script: whitelist-gated click intercept and target=_blank patch.
 *
 * Chrome injects content scripts as classic scripts (the manifest has no
 * module support), so the pure policy in link-policy.js is pulled in with a
 * dynamic import() of its extension URL — see web_accessible_resources in
 * manifest.json. Click handling stays synchronous (cached prefs + sendMessage)
 * so the service worker can open the tab without a lost user-activation race.
 */

;(async () => {
    "use strict"

    /**
     * Set once the policy module has loaded. The click listener below is bound
     * before that and has to tolerate the gap.
     * @type {((event: MouseEvent) => void)|null}
     */
    let dispatchClick = null

    // Bound synchronously, before the page has parsed its first script, to claim
    // the earliest capture slot on the outermost node: capture runs
    // outermost-first, and a page that stops propagation in its own window
    // handler cannot be beaten from document. The policy import below is async,
    // so the listener has to be a thin forwarder — binding it after the import
    // resolves would put it behind every handler the page registered meanwhile.
    window.addEventListener(
        "click",
        (event) => {
            if (dispatchClick) {
                dispatchClick(event)
            }
        },
        true
    )

    const { isHostAllowed, resolveHref, shouldSkipClick } = await import(
        chrome.runtime.getURL("link-policy.js")
    )

    const MSG_OPEN_TAB = "OPEN_TAB"
    const PATCHED_ATTR = "data-oint-patched"
    const VISITED_ATTR = "data-oint-visited"
    const STORAGE_KEY_MARK_VISITED = "markVisitedLinks"
    const STORAGE_KEY_VISITED = "visitedLinks"
    const VISITED_LINKS_LIMIT = 2000

    const state = {
        whitelist: [],
        openInBackground: false,
        /**
         * Recolouring links with the browser's visited colour is optional:
         * forcing it overrides the site's own link styling, which reads as a
         * bug on sites with static menus (see issue #26).
         */
        markVisited: true,
        visited: new Set(),
        intercepting: false,
        observer: null,
        pending: [],
        scheduled: false,
    }

    /**
     * Whether this content script still has a live extension runtime. Reading
     * `chrome.runtime` throws ("Extension context invalidated") once the
     * extension has been reloaded or updated behind an open tab, so the probe
     * itself has to be guarded.
     * @returns {boolean}
     */
    function hasLiveRuntime() {
        try {
            return Boolean(chrome.runtime?.id)
        } catch {
            // Extension context invalidated — no usable runtime.
            return false
        }
    }

    /**
     * Last resort when the extension can no longer open the tab itself (stale
     * runtime, or a service worker that cannot be reached): open it here so the
     * user's click is never silently swallowed.
     * @param {string} href
     */
    function openLinkFallback(href) {
        const opened = window.open(href, "_blank")
        if (opened) {
            opened.opener = null
        } else {
            location.href = href
        }
    }

    /**
     * Absolute URL a link points at, or `null` when the click is not ours to
     * intercept. Every link read goes through here rather than `.href`: an SVG
     * `<a>` exposes an `SVGAnimatedString` there, which used to open
     * `…/[object SVGAnimatedString]/`.
     * @param {Element} link
     * @returns {string|null}
     */
    function linkUrl(link) {
        return resolveHref(link.getAttribute("href"), document.baseURI)
    }

    /**
     * Resolve the anchor a click landed on.
     *
     * `event.target` is retargeted to the outermost shadow host when the click
     * starts inside a shadow tree, so `closest()` on it finds nothing and the
     * click was never intercepted — web-component navigation (the Salesforce
     * global nav, for example) slipped through. The composed path still lists
     * the real anchor, innermost first.
     * @param {MouseEvent} event
     * @returns {HTMLAnchorElement|null}
     */
    function findClickedLink(event) {
        if (typeof event.composedPath === "function") {
            for (const node of event.composedPath()) {
                if (
                    node.nodeType === Node.ELEMENT_NODE &&
                    node.matches?.("a[href]")
                ) {
                    return node
                }
            }
            return null
        }
        const target = event.target
        if (!target || typeof target.closest !== "function") {
            return null
        }
        return target.closest("a[href]")
    }

    function handleLinkClick(event) {
        if (!state.intercepting) {
            return
        }
        const link = findClickedLink(event)
        if (!link || shouldSkipClick(event, link)) {
            return
        }
        const url = linkUrl(link)
        if (!url) {
            return
        }
        // A stale content script — the extension was reloaded or updated while
        // this tab stayed open — has no usable runtime. Bail out before
        // preventDefault() so the click falls through to the browser instead of
        // being swallowed.
        if (!hasLiveRuntime()) {
            return
        }

        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()

        // With marking turned off we neither record the URL nor recolour the
        // link — the preference is opt-out of the feature, not just of its CSS.
        if (state.markVisited) {
            rememberVisit(link)
        }

        chrome.runtime
            .sendMessage({
                type: MSG_OPEN_TAB,
                url,
                active: !state.openInBackground,
            })
            .catch((error) => {
                console.error("Error opening tab:", error)
                // The default was already prevented above, so falling through is
                // no longer an option — open the link ourselves instead.
                openLinkFallback(url)
            })
    }

    dispatchClick = handleLinkClick

    function patchLinkTarget(link) {
        if (
            link.target ||
            link.hasAttribute("download") ||
            link.hasAttribute(PATCHED_ATTR) ||
            !linkUrl(link)
        ) {
            return
        }
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.setAttribute(PATCHED_ATTR, "1")
    }

    /**
     * Intercepted navigations never register as :visited on the source page
     * (the tab is opened outside its history context), so visited links are
     * tracked here. `VisitedText` is the browser's own visited colour and
     * `color-scheme` keeps it readable in light and dark themes.
     * @param {Element} link
     */
    function markVisitedLink(link) {
        const url = linkUrl(link)
        if (url && state.visited.has(url)) {
            link.setAttribute(VISITED_ATTR, "1")
            link.style.setProperty("color-scheme", "light dark")
            link.style.setProperty("color", "VisitedText", "important")
        } else {
            unmarkVisitedLink(link)
        }
    }

    function unmarkVisitedLink(link) {
        if (link.hasAttribute(VISITED_ATTR)) {
            link.removeAttribute(VISITED_ATTR)
            link.style.removeProperty("color-scheme")
            link.style.removeProperty("color")
        }
    }

    /**
     * @param {Element} link
     */
    function rememberVisit(link) {
        const url = linkUrl(link)
        if (!url) {
            return
        }
        const urls = [...state.visited].filter((u) => u !== url)
        urls.push(url)
        state.visited = new Set(urls.slice(-VISITED_LINKS_LIMIT))
        markVisitedLink(link)
        chrome.storage.local
            .set({ [STORAGE_KEY_VISITED]: [...state.visited] })
            .catch((error) => {
                console.error("Error saving visited links:", error)
            })
    }

    function processLink(link) {
        // Background-tab mode opens the tab itself, so a `target=_blank` would
        // open a second one; the visited mark is orthogonal to that.
        if (!state.openInBackground) {
            patchLinkTarget(link)
        }
        if (state.markVisited) {
            markVisitedLink(link)
        } else {
            unmarkVisitedLink(link)
        }
    }

    function processLinksUnder(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) {
            return
        }
        if (root.matches?.("a[href]")) {
            processLink(root)
        }
        root.querySelectorAll?.("a[href]").forEach(processLink)
    }

    function removeVisitedMarks() {
        document
            .querySelectorAll(`a[${VISITED_ATTR}]`)
            .forEach(unmarkVisitedLink)
    }

    function removePatchedTargets() {
        document.querySelectorAll(`a[${PATCHED_ATTR}]`).forEach((link) => {
            link.removeAttribute("target")
            link.removeAttribute("rel")
            link.removeAttribute(PATCHED_ATTR)
        })
    }

    function flushPendingPatches() {
        state.scheduled = false
        const batch = state.pending
        state.pending = []
        for (const node of batch) {
            processLinksUnder(node)
        }
    }

    function schedulePatchFlush() {
        if (state.scheduled) {
            return
        }
        state.scheduled = true
        if (typeof requestIdleCallback === "function") {
            requestIdleCallback(flushPendingPatches, { timeout: 200 })
        } else {
            setTimeout(flushPendingPatches, 0)
        }
    }

    function startObserver() {
        if (state.observer || !document.body) {
            return
        }
        state.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) =>
                        state.pending.push(node)
                    )
                } else if (
                    mutation.type === "attributes" &&
                    mutation.target.nodeType === Node.ELEMENT_NODE &&
                    mutation.target.matches?.("a[href]")
                ) {
                    state.pending.push(mutation.target)
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
        state.pending = []
        state.scheduled = false
    }

    /**
     * Bring the page in line with the current state — whitelist hit,
     * background-tab mode and the visited-mark preference — in one idempotent
     * pass. Every preference change funnels through here, so no combination of
     * toggles can leave stale patches or marks behind.
     */
    function syncDomState() {
        if (!state.intercepting) {
            stopObserver()
            removePatchedTargets()
            removeVisitedMarks()
            return
        }

        // Background-tab mode opens the tab itself; a leftover target=_blank
        // would open a second one.
        if (state.openInBackground) {
            removePatchedTargets()
        }

        const apply = () => {
            if (!state.intercepting) {
                return
            }
            // Patches when target patching is on, marks/unmarks per preference.
            processLinksUnder(document.body)
            startObserver()
        }

        if (document.body) {
            apply()
        } else {
            document.addEventListener("DOMContentLoaded", apply, { once: true })
        }
    }

    function applyToPage() {
        state.intercepting = isHostAllowed(location.hostname, state.whitelist)
        syncDomState()
    }

    function applyStorage(result) {
        state.whitelist = Array.isArray(result.userWhitelist)
            ? result.userWhitelist
            : []
        state.openInBackground = !!result.openInBackground
        // Absent means "on": the preference only exists to opt out.
        state.markVisited = result[STORAGE_KEY_MARK_VISITED] !== false
        state.visited = new Set(
            Array.isArray(result.visitedLinks) ? result.visitedLinks : []
        )
        applyToPage()
    }

    Promise.all([
        chrome.storage.sync.get([
            "userWhitelist",
            "openInBackground",
            STORAGE_KEY_MARK_VISITED,
        ]),
        chrome.storage.local.get([STORAGE_KEY_VISITED]),
    ])
        .then(([syncResult, localResult]) =>
            applyStorage({ ...syncResult, ...localResult })
        )
        .catch((error) => {
            console.error("Error loading intercept state:", error)
        })

    /**
     * Visited marks follow the stored URLs without a reload.
     */
    function syncVisitedMarks() {
        if (state.intercepting) {
            syncDomState()
        }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[STORAGE_KEY_VISITED]) {
            const next = changes[STORAGE_KEY_VISITED].newValue
            state.visited = new Set(Array.isArray(next) ? next : [])
            syncVisitedMarks()
            return
        }
        if (area !== "sync") {
            return
        }
        if (changes.userWhitelist) {
            const next = changes.userWhitelist.newValue
            state.whitelist = Array.isArray(next) ? next : []
        }
        if (changes.openInBackground) {
            state.openInBackground = !!changes.openInBackground.newValue
        }
        if (changes[STORAGE_KEY_MARK_VISITED]) {
            state.markVisited =
                changes[STORAGE_KEY_MARK_VISITED].newValue !== false
        }
        if (
            changes.userWhitelist ||
            changes.openInBackground ||
            changes[STORAGE_KEY_MARK_VISITED]
        ) {
            applyToPage()
        }
    })
})().catch((error) => {
    console.error("Error starting content script:", error)
})

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

    const { isHostAllowed, shouldSkipClick, shouldSkipHref } = await import(
        chrome.runtime.getURL("link-policy.js")
    )

    const MSG_OPEN_TAB = "OPEN_TAB"
    const PATCHED_ATTR = "data-oint-patched"

    const state = {
        whitelist: [],
        openInBackground: false,
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

    function handleLinkClick(event) {
        const target = event.target
        if (!target || typeof target.closest !== "function") {
            return
        }
        const link = target.closest("a[href]")
        if (!link || shouldSkipClick(event, link)) {
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

        chrome.runtime
            .sendMessage({
                type: MSG_OPEN_TAB,
                url: link.href,
                active: !state.openInBackground,
            })
            .catch((error) => {
                console.error("Error opening tab:", error)
                // The default was already prevented above, so falling through is
                // no longer an option — open the link ourselves instead.
                openLinkFallback(link.href)
            })
    }

    function patchLinkTarget(link) {
        if (
            link.target ||
            link.hasAttribute("download") ||
            link.hasAttribute(PATCHED_ATTR) ||
            shouldSkipHref(link.getAttribute("href"))
        ) {
            return
        }
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        link.setAttribute(PATCHED_ATTR, "1")
    }

    function processLink(link) {
        patchLinkTarget(link)
    }

    function patchLinksUnder(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) {
            return
        }
        if (root.matches?.("a[href]")) {
            processLink(root)
        }
        root.querySelectorAll?.("a[href]").forEach(processLink)
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
            patchLinksUnder(node)
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

    function startPatching() {
        const onReady = () => {
            if (!state.intercepting || state.openInBackground) {
                return
            }
            patchLinksUnder(document.body)
            startObserver()
        }
        if (document.body) {
            onReady()
        } else {
            document.addEventListener("DOMContentLoaded", onReady, {
                once: true,
            })
        }
    }

    function teardownPatching() {
        stopObserver()
        removePatchedTargets()
    }

    function syncPatching() {
        if (!state.intercepting || state.openInBackground) {
            teardownPatching()
            return
        }
        startPatching()
    }

    function applyToPage() {
        const should = isHostAllowed(location.hostname, state.whitelist)

        if (should && !state.intercepting) {
            document.addEventListener("click", handleLinkClick, true)
            state.intercepting = true
            syncPatching()
            return
        }

        if (!should && state.intercepting) {
            document.removeEventListener("click", handleLinkClick, true)
            teardownPatching()
            state.intercepting = false
            return
        }

        if (should && state.intercepting) {
            syncPatching()
        }
    }

    function applyStorage(result) {
        state.whitelist = Array.isArray(result.userWhitelist)
            ? result.userWhitelist
            : []
        state.openInBackground = !!result.openInBackground
        applyToPage()
    }

    chrome.storage.sync
        .get(["userWhitelist", "openInBackground"])
        .then(applyStorage)
        .catch((error) => {
            console.error("Error loading intercept state:", error)
        })

    chrome.storage.onChanged.addListener((changes, area) => {
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
        if (changes.userWhitelist || changes.openInBackground) {
            applyToPage()
        }
    })
})().catch((error) => {
    console.error("Error starting content script:", error)
})

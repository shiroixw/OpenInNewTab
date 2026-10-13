// @ts-check
/**
 * Pure host / click policy shared by content.js (module) and Node tests.
 * No DOM writes, no chrome APIs.
 */

/**
 * @param {string} hostname
 * @param {unknown} whitelist
 * @returns {boolean}
 */
export function isHostAllowed(hostname, whitelist) {
    if (!hostname || !Array.isArray(whitelist)) {
        return false
    }
    const host = hostname.toLowerCase()
    return whitelist.some((entry) => {
        if (typeof entry !== "string" || !entry) {
            return false
        }
        const domain = entry.toLowerCase()
        return host === domain || host.endsWith("." + domain)
    })
}

/**
 * @param {string|null} href
 * @returns {boolean}
 */
export function shouldSkipHref(href) {
    if (!href) {
        return true
    }
    return (
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
    )
}

/**
 * @param {Pick<MouseEvent, "ctrlKey"|"metaKey"|"shiftKey"|"button">} event
 * @param {{ hasAttribute: (name: string) => boolean, getAttribute: (name: string) => string|null }} link
 * @returns {boolean}
 */
export function shouldSkipClick(event, link) {
    if (link.hasAttribute("download")) {
        return true
    }
    if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.button === 1
    ) {
        return true
    }
    return shouldSkipHref(link.getAttribute("href"))
}

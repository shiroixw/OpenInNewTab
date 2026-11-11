// @ts-check
/**
 * Pure host / click policy shared by content.js (module) and Node tests.
 * No DOM writes, no chrome APIs.
 */

/** Longest legal DNS name, in characters. */
const MAX_DOMAIN_LENGTH = 253

/** One DNS label: alphanumeric, inner hyphens, 1–63 chars. */
const DOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Canonicalize one whitelist entry into a bare lowercase hostname.
 *
 * Accepts what users actually paste — `https://GitHub.com/settings`, a host
 * with a port, a trailing dot — and returns `null` for anything that cannot be
 * a hostname, so callers can reject the entry instead of storing a value that
 * will never match. IDNs are punycoded by `URL`, matching `location.hostname`.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeDomain(raw) {
    if (typeof raw !== "string") {
        return null
    }
    const trimmed = raw.trim()
    // Whitespace and wildcards have no meaning for our matcher.
    if (!trimmed || /\s/.test(trimmed) || trimmed.includes("*")) {
        return null
    }

    let hostname
    try {
        const url = new URL(
            SCHEME_RE.test(trimmed) ? trimmed : "http://" + trimmed
        )
        hostname = url.hostname
    } catch {
        return null
    }

    hostname = hostname.toLowerCase().replace(/\.$/, "")
    if (!hostname || hostname.length > MAX_DOMAIN_LENGTH) {
        return null
    }
    if (!hostname.split(".").every((label) => DOMAIN_LABEL_RE.test(label))) {
        return null
    }
    return hostname
}

/**
 * Whether one stored entry covers `hostname` (exact host or parent domain).
 * @param {string} host
 * @param {string} entry
 * @returns {boolean}
 */
function entryCovers(host, entry) {
    return host === entry || host.endsWith("." + entry)
}

/**
 * @param {string} hostname
 * @param {unknown} whitelist
 * @returns {boolean}
 */
export function isHostAllowed(hostname, whitelist) {
    if (!hostname || !Array.isArray(whitelist)) {
        return false
    }
    const host = String(hostname).toLowerCase()
    return whitelist.some((entry) => {
        if (typeof entry !== "string" || !entry) {
            return false
        }
        return entryCovers(host, entry.toLowerCase())
    })
}

/**
 * Schemes of documents the browser never lets an extension script: internal
 * pages, other extensions' pages, and the viewer wrappers it serves for them.
 * Kept as a synchronous fast path; host denylists are not used — those rot as
 * store domains change across Chrome / Edge / Firefox.
 */
const RESTRICTED_SCHEMES = new Set([
    "about:",
    "chrome:",
    "chrome-untrusted:",
    "chrome-extension:",
    "devtools:",
    "edge:",
    "view-source:",
])

/**
 * Message type the popup sends to ask whether the content script is alive on
 * the active tab. Kept in this shared module so the probe classifier and the
 * popup agree on the string; the content script registers the same literal
 * before its first `await` (classic scripts cannot sync-import this module).
 */
export const CONTENT_SCRIPT_PING = "OINT_PING"

/**
 * Whether the URL scheme alone proves content scripts cannot run.
 *
 * Host-level blocks (Web Store, etc.) are detected at runtime by probing the
 * content script instead of maintaining a denylist. Unparseable input counts
 * as unprotected — a false "restricted" verdict would disable the extension on
 * a real site, which is the worse mistake.
 * @param {string|URL|null|undefined} url
 * @returns {boolean}
 */
export function isRestrictedUrl(url) {
    if (!url) {
        return false
    }
    /** @type {URL} */
    let parsed
    try {
        parsed = url instanceof URL ? url : new URL(String(url))
    } catch {
        return false
    }
    return RESTRICTED_SCHEMES.has(parsed.protocol)
}

/**
 * Classify a `chrome.tabs.sendMessage` ping to the content script.
 *
 * - `alive` — the content script answered; whitelisting can take effect.
 * - `missing` — no receiving end; the browser did not inject us, so a
 *   whitelist entry would never apply.
 * - `uncertain` — timeout or an unfamiliar error; callers must fail open so a
 *   still-loading ordinary page is not locked out of quick-add.
 *
 * @param {{ response?: unknown, error?: unknown, timedOut?: boolean }} [outcome]
 * @returns {"alive"|"missing"|"uncertain"}
 */
export function classifyContentScriptProbe(outcome = {}) {
    const { response, error, timedOut } = outcome
    if (timedOut) {
        return "uncertain"
    }
    if (
        response &&
        typeof response === "object" &&
        /** @type {{ ok?: unknown }} */ (response).ok === true
    ) {
        return "alive"
    }
    if (error != null) {
        const message =
            typeof error === "string"
                ? error
                : error instanceof Error
                  ? error.message
                  : typeof error === "object" &&
                      error &&
                      "message" in error &&
                      typeof /** @type {{ message?: unknown }} */ (error)
                          .message === "string"
                    ? /** @type {{ message: string }} */ (error).message
                    : String(error)
        if (
            /Receiving end does not exist/i.test(message) ||
            /Could not establish connection/i.test(message)
        ) {
            return "missing"
        }
        return "uncertain"
    }
    return "uncertain"
}

/**
 * Whether quick-add should be disabled for the active tab.
 *
 * Scheme checks short-circuit; otherwise only a definitive "content script
 * missing" probe blocks. Uncertainty fails open.
 *
 * @param {{ url?: string|URL|null, probe?: "alive"|"missing"|"uncertain" }} [input]
 * @returns {boolean}
 */
export function isPageRestrictedForQuickAdd(input = {}) {
    const { url, probe = "uncertain" } = input
    if (isRestrictedUrl(url)) {
        return true
    }
    return probe === "missing"
}

/**
 * Most specific entry covering `hostname` — the one to name in a "already
 * covered by …" hint. `null` when the host is not whitelisted.
 * @param {string} hostname
 * @param {unknown} whitelist
 * @returns {string|null}
 */
export function findCoveringDomain(hostname, whitelist) {
    if (!hostname || !Array.isArray(whitelist)) {
        return null
    }
    const host = String(hostname).toLowerCase()
    /** @type {string|null} */
    let best = null
    for (const entry of whitelist) {
        if (typeof entry !== "string" || !entry) {
            continue
        }
        if (!entryCovers(host, entry.toLowerCase())) {
            continue
        }
        if (!best || entry.length > best.length) {
            best = entry
        }
    }
    return best
}

/**
 * Normalize and de-duplicate a stored list, preserving order.
 *
 * `changed` tells the caller whether the canonical form differs from what is
 * stored, so legacy entries (scheme, mixed case, duplicates, junk) can be
 * repaired once instead of silently never matching.
 * @param {unknown} value
 * @returns {{ domains: string[], changed: boolean }}
 */
export function sanitizeWhitelist(value) {
    const list = Array.isArray(value) ? value : []
    /** @type {string[]} */
    const domains = []
    const seen = new Set()
    let changed = !Array.isArray(value)

    for (const entry of list) {
        const domain = normalizeDomain(entry)
        if (!domain || seen.has(domain)) {
            changed = true
            continue
        }
        seen.add(domain)
        if (domain !== entry) {
            changed = true
        }
        domains.push(domain)
    }
    return { domains, changed }
}

/**
 * Add normalized entries to a list without creating duplicates or redundant
 * subdomains of an existing entry.
 * @param {string[]} domains Already-sanitized list.
 * @param {unknown} incoming Raw entries (e.g. an imported JSON array).
 * @returns {{ domains: string[], added: number, duplicate: number, invalid: number }}
 */
export function mergeWhitelist(domains, incoming) {
    const merged = [...domains]
    const seen = new Set(merged)
    let added = 0
    let duplicate = 0
    let invalid = 0

    for (const raw of Array.isArray(incoming) ? incoming : []) {
        const domain = normalizeDomain(raw)
        if (!domain) {
            invalid += 1
            continue
        }
        if (seen.has(domain) || findCoveringDomain(domain, merged)) {
            duplicate += 1
            continue
        }
        seen.add(domain)
        merged.push(domain)
        added += 1
    }

    return { domains: merged, added, duplicate, invalid }
}

/**
 * Drop every entry covering `hostname` — used by the popup's "remove current
 * domain" action, which must also undo a parent entry that covers this host.
 * @param {unknown} whitelist
 * @param {string} hostname
 * @returns {{ domains: string[], removed: string[] }}
 */
export function removeHostFromWhitelist(whitelist, hostname) {
    const list = Array.isArray(whitelist) ? whitelist : []
    const host = typeof hostname === "string" ? hostname.toLowerCase() : ""
    if (!host) {
        return { domains: [...list], removed: [] }
    }

    /** @type {string[]} */
    const domains = []
    /** @type {string[]} */
    const removed = []
    for (const entry of list) {
        const covered =
            typeof entry === "string" &&
            entry !== "" &&
            entryCovers(host, entry.toLowerCase())
        if (covered) {
            removed.push(entry)
        } else {
            domains.push(entry)
        }
    }
    return { domains, removed }
}

/** Schemes a new tab may be opened at on the extension's behalf. */
const INTERCEPTABLE_SCHEMES = new Set(["http:", "https:"])

/**
 * Absolute URL a link points at, or `null` when the click must be left to the
 * browser.
 *
 * `HTMLAnchorElement.href` already returns a string, but an SVG `<a>` exposes
 * an `SVGAnimatedString` instead — handing that to `chrome.tabs.create` opened
 * `…/[object SVGAnimatedString]/`. Resolving the raw attribute here keeps one
 * string-or-nothing contract for every element shape a site throws at us.
 * @param {string|null} href Raw `href` attribute (`getAttribute`), not `.href`.
 * @param {string} baseURI Document base URL, for relative hrefs.
 * @returns {string|null}
 */
export function resolveHref(href, baseURI) {
    if (typeof href !== "string" || !href.trim() || shouldSkipHref(href)) {
        return null
    }
    let url
    try {
        url = new URL(href, baseURI)
    } catch {
        return null
    }
    return INTERCEPTABLE_SCHEMES.has(url.protocol) ? url.href : null
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

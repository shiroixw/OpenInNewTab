import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    CONTENT_SCRIPT_PING,
    classifyContentScriptProbe,
    findCoveringDomain,
    isHostAllowed,
    isPageRestrictedForQuickAdd,
    isRestrictedUrl,
    mergeWhitelist,
    normalizeDomain,
    removeHostFromWhitelist,
    resolveHref,
    sanitizeWhitelist,
    shouldSkipClick,
    shouldSkipHref,
} from "../extension/link-policy.js"

describe("isHostAllowed", () => {
    it("rejects empty hostname or non-array whitelist", () => {
        assert.equal(isHostAllowed("github.com", []), false)
        assert.equal(isHostAllowed("", ["github.com"]), false)
        assert.equal(isHostAllowed("github.com", null), false)
    })

    it("matches an exact host and subdomains, not a suffix sibling", () => {
        const list = ["github.com"]
        assert.equal(isHostAllowed("github.com", list), true)
        assert.equal(isHostAllowed("gist.github.com", list), true)
        assert.equal(isHostAllowed("notgithub.com", list), false)
    })
})

describe("isRestrictedUrl", () => {
    // Scheme-only fast path. Host denylists rot (Web Store domains change across
    // Chrome / Edge / Firefox); whether a page can be whitelisted is decided by
    // a live content-script probe, not by a maintained host list.
    it("flags browser-internal and other-extension schemes", () => {
        for (const url of [
            "chrome://extensions/",
            "chrome://newtab/",
            "chrome-extension://kjhbpoaepnfmchijkgihciehjggpbech/options.html",
            "devtools://devtools/bundled/inspector.html",
            "view-source:https://example.com",
            "about:blank",
            "edge://settings/",
            "chrome-untrusted://new-tab-page/",
        ]) {
            assert.equal(isRestrictedUrl(url), true, `expected restricted: ${url}`)
        }
    })

    it("does not treat https hosts as restricted by themselves", () => {
        for (const url of [
            "https://github.com/shiroixw/OpenInNewTab",
            "https://www.google.com/webstore",
            "https://chrome.google.com/webstore/devconsole/f7f8a757/edit",
            "https://chrome.google.com/robots.txt",
            "https://chromewebstore.google.com/detail/abc",
            "https://chrome.google.com.example.com/webstore",
            "http://localhost:8080/",
            "https://example.com/",
        ]) {
            assert.equal(isRestrictedUrl(url), false, `expected allowed: ${url}`)
        }
    })

    it("accepts a URL object and treats empty or unparseable input as allowed", () => {
        assert.equal(
            isRestrictedUrl(new URL("chrome://extensions/")),
            true
        )
        for (const value of [null, undefined, "", "not a url"]) {
            assert.equal(isRestrictedUrl(value), false)
        }
    })
})

describe("classifyContentScriptProbe", () => {
    it("reports alive when the content script answers the ping", () => {
        assert.equal(
            classifyContentScriptProbe({ response: { ok: true } }),
            "alive"
        )
    })

    it("reports missing when there is no receiving end", () => {
        assert.equal(
            classifyContentScriptProbe({
                error: new Error(
                    "Could not establish connection. Receiving end does not exist."
                ),
            }),
            "missing"
        )
        assert.equal(
            classifyContentScriptProbe({
                error: "Could not establish connection. Receiving end does not exist.",
            }),
            "missing"
        )
    })

    it("reports uncertain on timeout or unfamiliar errors (fail open)", () => {
        assert.equal(
            classifyContentScriptProbe({ timedOut: true }),
            "uncertain"
        )
        assert.equal(
            classifyContentScriptProbe({
                error: Object.assign(new Error("content-script probe timed out"), {
                    timedOut: true,
                }),
                timedOut: true,
            }),
            "uncertain"
        )
        assert.equal(
            classifyContentScriptProbe({
                error: new Error("Extension context invalidated."),
            }),
            "uncertain"
        )
        assert.equal(classifyContentScriptProbe({ response: {} }), "uncertain")
        assert.equal(classifyContentScriptProbe({}), "uncertain")
    })
})

describe("isPageRestrictedForQuickAdd", () => {
    it("blocks on restricted schemes without needing a probe", () => {
        assert.equal(
            isPageRestrictedForQuickAdd({
                url: "chrome://extensions/",
                probe: "uncertain",
            }),
            true
        )
    })

    it("blocks when the content script is missing on an ordinary https page", () => {
        assert.equal(
            isPageRestrictedForQuickAdd({
                url: "https://chromewebstore.google.com/detail/abc",
                probe: "missing",
            }),
            true
        )
    })

    it("leaves ordinary sites alone when the content script is alive", () => {
        assert.equal(
            isPageRestrictedForQuickAdd({
                url: "https://example.com/",
                probe: "alive",
            }),
            false
        )
    })

    it("fails open on probe uncertainty so a still-loading page is not locked out", () => {
        assert.equal(
            isPageRestrictedForQuickAdd({
                url: "https://example.com/",
                probe: "uncertain",
            }),
            false
        )
    })

    it("blocks when the URL is hidden but the content script is missing", () => {
        // chrome:// tabs often omit tab.url without the "tabs" permission; the
        // probe is still authoritative.
        assert.equal(
            isPageRestrictedForQuickAdd({
                url: null,
                probe: "missing",
            }),
            true
        )
    })
})

describe("CONTENT_SCRIPT_PING", () => {
    it("exports a stable ping type for popup and content script", () => {
        assert.equal(CONTENT_SCRIPT_PING, "OINT_PING")
    })
})

describe("shouldSkipHref", () => {
    it("skips empty, javascript, mailto, tel, and in-page hashes", () => {
        assert.equal(shouldSkipHref(null), true)
        assert.equal(shouldSkipHref(""), true)
        assert.equal(shouldSkipHref("javascript:void(0)"), true)
        assert.equal(shouldSkipHref("mailto:a@b.c"), true)
        assert.equal(shouldSkipHref("tel:+15551212"), true)
        assert.equal(shouldSkipHref("#section"), true)
        assert.equal(shouldSkipHref("https://example.com/a"), false)
        assert.equal(shouldSkipHref("/relative"), false)
    })
})

describe("resolveHref", () => {
    const base = "https://site.example/a/b"

    it("resolves relative, absolute and SVG-style raw attributes to one string", () => {
        // The SVG <a> case: callers pass getAttribute("href"), never `.href`.
        assert.equal(resolveHref("/x", base), "https://site.example/x")
        assert.equal(resolveHref("x", base), "https://site.example/a/x")
        assert.equal(
            resolveHref("./x#frag", base),
            "https://site.example/a/x#frag"
        )
        assert.equal(
            resolveHref("https://other.example/y", base),
            "https://other.example/y"
        )
        assert.equal(
            resolveHref("  https://other.example/y  ", base),
            "https://other.example/y"
        )
    })

    it("returns null for anything a new tab must not be opened at", () => {
        for (const href of [
            null,
            "",
            "   ",
            "#frag",
            "javascript:void(0)",
            "JavaScript:void(0)",
            "MAILTO:a@b.c",
            "tel:+15551212",
            "data:text/html,<p>x",
            "ftp://example.com/x",
            "http://",
        ]) {
            assert.equal(resolveHref(href, base), null, `expected null for ${href}`)
        }
    })
})

function click(overrides = {}) {
    return {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        button: 0,
        ...overrides,
    }
}

function anchor(attrs = {}) {
    const href = "href" in attrs ? attrs.href : "https://example.com"
    return {
        hasAttribute: (name) => name === "download" && attrs.download === true,
        getAttribute: (name) => (name === "href" ? href : null),
    }
}

describe("shouldSkipClick", () => {
    it("skips download links and modified / middle clicks", () => {
        assert.equal(shouldSkipClick(click(), anchor({ download: true })), true)
        assert.equal(shouldSkipClick(click({ ctrlKey: true }), anchor()), true)
        assert.equal(shouldSkipClick(click({ metaKey: true }), anchor()), true)
        assert.equal(shouldSkipClick(click({ shiftKey: true }), anchor()), true)
        assert.equal(shouldSkipClick(click({ button: 1 }), anchor()), true)
        assert.equal(shouldSkipClick(click(), anchor()), false)
    })
})

describe("normalizeDomain", () => {
    it("reduces URLs, ports, trailing dots and case to a bare hostname", () => {
        assert.equal(normalizeDomain("https://GitHub.com/settings"), "github.com")
        assert.equal(normalizeDomain("http://github.com:8080/x"), "github.com")
        assert.equal(normalizeDomain("  GitHub.com.  "), "github.com")
        assert.equal(normalizeDomain("gist.github.com"), "gist.github.com")
    })

    it("keeps single-label hosts and IPs, punycodes IDNs", () => {
        assert.equal(normalizeDomain("localhost"), "localhost")
        assert.equal(normalizeDomain("192.168.1.10"), "192.168.1.10")
        assert.equal(normalizeDomain("例子.测试"), "xn--fsqu00a.xn--0zwm56d")
    })

    it("rejects values that can never match a hostname", () => {
        for (const raw of [
            "",
            "   ",
            null,
            42,
            "https://",
            "*.github.com",
            "exa mple.com",
            "-bad.com",
            "foo_bar.com",
            "a".repeat(64) + ".com",
        ]) {
            assert.equal(normalizeDomain(raw), null, `expected null for ${raw}`)
        }
    })
})

describe("sanitizeWhitelist", () => {
    it("canonicalizes, de-duplicates and reports whether it changed", () => {
        const { domains, changed } = sanitizeWhitelist([
            "HTTPS://GitHub.com/a",
            "github.com",
            "",
            42,
            "example.com",
        ])
        assert.deepEqual(domains, ["github.com", "example.com"])
        assert.equal(changed, true)
    })

    it("leaves an already-canonical list untouched", () => {
        const { domains, changed } = sanitizeWhitelist(["github.com", "a.io"])
        assert.deepEqual(domains, ["github.com", "a.io"])
        assert.equal(changed, false)
    })

    it("treats a non-array value as an empty list", () => {
        assert.deepEqual(sanitizeWhitelist(undefined), {
            domains: [],
            changed: true,
        })
    })
})

describe("mergeWhitelist", () => {
    it("adds only new, valid, non-covered entries", () => {
        const { domains, added, duplicate, invalid } = mergeWhitelist(
            ["github.com"],
            ["https://GitHub.com/x", "gist.github.com", "example.com", "bad host"]
        )
        assert.deepEqual(domains, ["github.com", "example.com"])
        assert.equal(added, 1)
        assert.equal(duplicate, 2)
        assert.equal(invalid, 1)
    })

    it("does not mutate the input list", () => {
        const existing = ["github.com"]
        mergeWhitelist(existing, ["example.com"])
        assert.deepEqual(existing, ["github.com"])
    })
})

describe("findCoveringDomain", () => {
    it("returns the most specific entry covering the host", () => {
        const list = ["github.com", "gist.github.com"]
        assert.equal(findCoveringDomain("gist.github.com", list), "gist.github.com")
        assert.equal(findCoveringDomain("github.com", list), "github.com")
        assert.equal(findCoveringDomain("example.com", list), null)
    })
})

describe("removeHostFromWhitelist", () => {
    it("removes a parent entry that covers the host", () => {
        const { domains, removed } = removeHostFromWhitelist(
            ["github.com", "example.com"],
            "gist.github.com"
        )
        assert.deepEqual(removed, ["github.com"])
        assert.deepEqual(domains, ["example.com"])
    })

    it("reports nothing removed when the host is not whitelisted", () => {
        const { domains, removed } = removeHostFromWhitelist(
            ["example.com"],
            "github.com"
        )
        assert.deepEqual(removed, [])
        assert.deepEqual(domains, ["example.com"])
    })
})

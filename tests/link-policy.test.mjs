import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    findCoveringDomain,
    isHostAllowed,
    mergeWhitelist,
    normalizeDomain,
    removeHostFromWhitelist,
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

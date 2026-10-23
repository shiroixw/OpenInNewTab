import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const popupScript = readFileSync(join(root, "extension/popup.js"), "utf8")
const optionsScript = readFileSync(join(root, "extension/options.js"), "utf8")
const contentScript = readFileSync(join(root, "extension/content.js"), "utf8")
const popupHtml = readFileSync(join(root, "extension/popup.html"), "utf8")
const optionsHtml = readFileSync(join(root, "extension/options.html"), "utf8")
const privacyPolicy = readFileSync(join(root, "PRIVACY_POLICY.md"), "utf8")
const websitePrivacyPolicy = readFileSync(
    join(root, "website/privacy-policy.html"),
    "utf8"
)
const websiteI18n = readFileSync(join(root, "website/i18n.js"), "utf8")

const documentLangAssignment = /document\.documentElement\.lang\s*=/
const hardcodedErrorNotification =
    /showNotification\s*\(\s*(["'`])Error /

describe("extension quality contracts", () => {
    it("popup and options update the document language", () => {
        assert.match(popupScript, documentLangAssignment)
        assert.match(optionsScript, documentLangAssignment)
    })

    it("localized error messages are not hardcoded", () => {
        assert.doesNotMatch(popupScript, hardcodedErrorNotification)
        assert.doesNotMatch(optionsScript, hardcodedErrorNotification)
    })

    it("popup modal close button has an accessible name", () => {
        assert.match(popupHtml, /id="modalCloseBtn"[^>]*aria-label=/s)
    })

    it("privacy policy omits scripting permission and explains sync storage", () => {
        assert.doesNotMatch(privacyPolicy, /scripting/)
        assert.match(privacyPolicy, /chrome\.storage\.sync[\s\S]*synchron/i)
    })

    it("website privacy policy omits scripting permission and documents host pattern", () => {
        assert.doesNotMatch(websitePrivacyPolicy, /<strong>scripting<\/strong>/)
        assert.match(websitePrivacyPolicy, /\*:\/\/\*\//)
        assert.match(websitePrivacyPolicy, /chrome\.storage\.sync/)
    })

    it("website i18n omits unused privacyPermScripting key", () => {
        assert.doesNotMatch(websiteI18n, /privacyPermScripting/)
    })

    it("popup background toggle has a programmatic accessible name", () => {
        const hasAriaLabel = /id="openInBackgroundToggle"[^>]*aria-label=/.test(
            popupHtml
        )
        const hasExplicitLabel =
            /<label[^>]*\sfor="openInBackgroundToggle"/.test(popupHtml)
        assert.ok(
            hasAriaLabel || hasExplicitLabel,
            "openInBackgroundToggle requires aria-label or label[for]"
        )
    })

    it("options background toggle has a programmatic accessible name", () => {
        const hasAriaLabel =
            /id="openInBackgroundToggle"[^>]*aria-label=/.test(optionsHtml)
        const hasExplicitLabel =
            /<label[^>]*\sfor="openInBackgroundToggle"/.test(optionsHtml)
        assert.ok(
            hasAriaLabel || hasExplicitLabel,
            "options openInBackgroundToggle requires aria-label or label[for]"
        )
    })

    it("popup and options propagate saveUserWhitelist storage errors", () => {
        for (const [label, source] of [
            ["popup.js", popupScript],
            ["options.js", optionsScript],
        ]) {
            const fnBody = source.match(
                /async\s+function\s+saveUserWhitelist\(domains\)\s+\{([\s\S]*?\n[ \t]{4}\})/
            )?.[1]
            assert.ok(fnBody, `${label} defines saveUserWhitelist`)
            assert.match(
                fnBody,
                /catch[\s\S]*?throw/,
                `${label} saveUserWhitelist must rethrow storage errors`
            )
        }
    })

    it("whitelist writes go through the shared host policy", () => {
        // The UI used to push raw input and compare with `Array.includes`, which
        // disagreed with the content script's subdomain matching. Both pages must
        // canonicalize before writing and ask the policy whether a host is
        // already covered.
        for (const [label, source] of [
            ["popup.js", popupScript],
            ["options.js", optionsScript],
        ]) {
            assert.match(
                source,
                /normalizeDomain/,
                `${label} must canonicalize user input`
            )
            assert.doesNotMatch(
                source,
                /whitelist\.push\(/,
                `${label} must merge through the policy, not push raw entries`
            )
        }
        assert.match(
            popupScript,
            /isHostAllowed/,
            "popup.js must use the shared host policy for the quick-add state"
        )
    })

    it("content script probes the runtime before preventing the default", () => {
        // A content script outlives an extension reload/update. Once its context
        // is invalidated, chrome.runtime throws and the service worker is gone —
        // so the probe has to happen *before* preventDefault(), otherwise the
        // click is swallowed and the link does nothing at all.
        // Scoped to the handler body so the probe in the doc comment above and
        // the hasLiveRuntime() definition cannot satisfy the assertion.
        const handler = contentScript.match(
            /function handleLinkClick\(event\) \{([\s\S]*?)\n {4}\}/
        )?.[1]
        assert.ok(handler, "content.js defines handleLinkClick")
        const guard = handler.indexOf("hasLiveRuntime()")
        const preventDefault = handler.indexOf("event.preventDefault()")
        assert.ok(guard !== -1, "handleLinkClick must probe for a live runtime")
        assert.ok(
            preventDefault !== -1,
            "handleLinkClick must still call event.preventDefault()"
        )
        assert.ok(
            guard < preventDefault,
            "the runtime probe must run before preventDefault()"
        )
    })
})

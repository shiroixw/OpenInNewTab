import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const popupScript = readFileSync(join(root, "extension/popup.js"), "utf8")
const optionsScript = readFileSync(join(root, "extension/options.js"), "utf8")
const contentScript = readFileSync(join(root, "extension/content.js"), "utf8")
const backgroundScript = readFileSync(
    join(root, "extension/background.js"),
    "utf8"
)
const welcomeScript = readFileSync(join(root, "extension/welcome.js"), "utf8")
const userscript = readFileSync(
    join(root, "userscript/OpenInNewTab.user.js"),
    "utf8"
)
const popupCss = readFileSync(join(root, "extension/popup.css"), "utf8")
const popupHtml = readFileSync(join(root, "extension/popup.html"), "utf8")
const optionsHtml = readFileSync(join(root, "extension/options.html"), "utf8")
const welcomeHtml = readFileSync(join(root, "extension/welcome.html"), "utf8")
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

    it("theme is driven by a data attribute, not an inline style match", () => {
        assert.match(popupCss, /body\[data-color-scheme="dark"\]/)
        assert.match(popupCss, /body\[data-color-scheme="light"\]/)
        assert.doesNotMatch(
            popupCss,
            /body\[style\*=/,
            "popup.css must not select on the inline style string"
        )
    })

    it("extension pages delegate theme application to theme.js", () => {
        for (const [label, source] of [
            ["popup.js", popupScript],
            ["options.js", optionsScript],
            ["welcome.js", welcomeScript],
        ]) {
            assert.match(
                source,
                /OINTTheme\.apply\(/,
                `${label} must apply the theme through the shared runtime`
            )
            assert.doesNotMatch(
                source,
                /body\.style\.colorScheme\s*=/,
                `${label} must not write the scheme directly`
            )
            assert.match(
                source,
                /OINTTheme\.watchSystem\(/,
                `${label} must follow OS changes while the preference is auto`
            )
        }
    })

    it("every extension page loads theme.js before its own script", () => {
        for (const [label, html, script] of [
            ["popup.html", popupHtml, "popup.js"],
            ["options.html", optionsHtml, "options.js"],
            ["welcome.html", welcomeHtml, "welcome.js"],
        ]) {
            const themeTag = html.indexOf('src="theme.js"')
            const scriptTag = html.indexOf(`src="${script}"`)
            assert.ok(themeTag !== -1, `${label} must load theme.js`)
            assert.ok(
                themeTag < scriptTag,
                `${label} must load theme.js before ${script}`
            )
        }
    })

    it("popup loads the release table before its own script", () => {
        const noticesTag = popupHtml.indexOf('src="update-notices.js"')
        const popupTag = popupHtml.indexOf('src="popup.js"')
        assert.ok(noticesTag !== -1, "popup.html must load update-notices.js")
        assert.ok(
            noticesTag < popupTag,
            "popup.html must load update-notices.js before popup.js"
        )
    })

    it("update notes are passive, opt-out and per-version", () => {
        // The service worker must stay out of it: an update that opens a tab
        // takes the browser away from whatever the user was doing, which is
        // how this feature was first designed and why it was never shipped.
        assert.doesNotMatch(backgroundScript, /update-notice|updateNotice/)
        assert.match(popupScript, /shouldShowUpdateNotice/)
        assert.match(popupScript, /updateNoticeEnabled === false/)
        // Dismissal is keyed by version, so the next release gets a fresh chance.
        assert.match(popupScript, /dismissedUpdateNotice:\s*chrome\.runtime/)
        assert.match(optionsScript, /updateNoticeEnabled/)
    })

    it("every extension page links to the release notes", () => {
        for (const [label, html] of [
            ["popup.html", popupHtml],
            ["options.html", optionsHtml],
        ]) {
            assert.match(
                html,
                /href="https:\/\/github\.com\/shiroixw\/OpenInNewTab\/releases"/,
                `${label} must link to the release notes`
            )
        }
    })

    it("content script resolves clicks that start inside a shadow tree", () => {
        // `event.target` is retargeted to the shadow host, so `closest("a[href]")`
        // on it returns null and nav links rendered by web components (Salesforce
        // hgf-c360nav) were never intercepted. The composed path keeps the anchor.
        assert.match(contentScript, /function findClickedLink\(event\)/)
        assert.match(contentScript, /event\.composedPath\(\)/)
        const handler = contentScript.match(
            /function handleLinkClick\(event\) \{([\s\S]*?)\n {4}\}/
        )?.[1]
        assert.ok(handler, "content.js defines handleLinkClick")
        assert.match(handler, /findClickedLink\(event\)/)
    })

    it("claims the earliest capture slot synchronously", () => {
        // Capture runs outermost-first: a page that stops propagation in its own
        // window handler must not be able to swallow the click first. The policy
        // module arrives through an async import, so the listener registered
        // before it has to be a forwarder — binding after the import resolves
        // would place it behind every page handler registered meanwhile.
        const bind = contentScript.indexOf("window.addEventListener(")
        const importAt = contentScript.indexOf("await import(")
        assert.ok(bind !== -1, "content.js binds a click listener on window")
        assert.ok(importAt !== -1, "content.js still imports the policy module")
        assert.ok(
            bind < importAt,
            "the click binding must precede the async policy import"
        )
        assert.match(contentScript, /dispatchClick = handleLinkClick/)
        assert.doesNotMatch(
            contentScript,
            /document\.(add|remove)EventListener\("click"/
        )
        assert.doesNotMatch(contentScript, /removeEventListener\("click"/)
    })

    it("reads link URLs through resolveHref, never through .href", () => {
        // An <a> inside SVG exposes SVGAnimatedString at `.href`, which used to
        // open `…/[object SVGAnimatedString]/`.
        assert.doesNotMatch(contentScript, /link\.href/)
        assert.match(
            contentScript,
            /resolveHref\(\s*link\.getAttribute\("href"\),\s*document\.baseURI\s*\)/
        )
    })

    it("userscript mirrors the click-resolution hardening", () => {
        for (const name of ["findClickedLink", "linkUrl"]) {
            assert.match(
                userscript,
                new RegExp(`function ${name}\\(`),
                `userscript must mirror ${name}`
            )
        }
        assert.match(
            userscript,
            /window\.addEventListener\("click", handleLinkClick, true\)/
        )
        assert.match(userscript, /if \(!state\.isApplied\) return/)
        assert.doesNotMatch(userscript, /link\.href/)
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

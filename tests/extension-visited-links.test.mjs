import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const contentScript = readFileSync(join(root, "extension/content.js"), "utf8")
const optionsScript = readFileSync(join(root, "extension/options.js"), "utf8")
const optionsHtml = readFileSync(join(root, "extension/options.html"), "utf8")
const backgroundScript = readFileSync(
    join(root, "extension/background.js"),
    "utf8"
)
const enLocale = readFileSync(join(root, "shared/locales/ext/en.json"), "utf8")

/** Body of a top-level function declaration in a classic script. */
function functionBody(source, name) {
    return source.match(
        new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n {4}\\}`)
    )?.[1]
}

describe("extension visited-link marking", () => {
    it("reads the preference from sync storage, defaulting to on", () => {
        assert.match(
            contentScript,
            /STORAGE_KEY_MARK_VISITED = "markVisitedLinks"/
        )
        assert.match(
            contentScript,
            /state\.markVisited = result\[STORAGE_KEY_MARK_VISITED\] !== false/
        )
        assert.match(
            contentScript,
            /chrome\.storage\.sync\.get\(\[[\s\S]*?STORAGE_KEY_MARK_VISITED[\s\S]*?\]\)/
        )
        // Fresh installs seed the same default explicitly.
        assert.match(backgroundScript, /updates\.markVisitedLinks = true/)
    })

    it("neither records nor recolours clicks when the preference is off", () => {
        const handler = functionBody(contentScript, "handleLinkClick")
        assert.ok(handler, "content.js defines handleLinkClick")
        assert.match(handler, /if \(state\.markVisited\) \{\s*rememberVisit\(link\)/)

        const processLink = functionBody(contentScript, "processLink")
        assert.ok(processLink, "content.js defines processLink")
        assert.match(
            processLink,
            /if \(state\.markVisited\) \{\s*markVisitedLink\(link\)\s*\} else \{\s*unmarkVisitedLink\(link\)/
        )
    })

    it("clears existing marks when the preference is turned off live", () => {
        assert.match(contentScript, /changes\[STORAGE_KEY_MARK_VISITED\]/)
        assert.match(
            contentScript,
            /changes\.openInBackground \|\|\s*changes\[STORAGE_KEY_MARK_VISITED\]/
        )

        // A preference flip re-renders the DOM, and processLink unmarks links
        // when the preference is off, so existing colours disappear at once.
        const sync = functionBody(contentScript, "syncDomState")
        assert.ok(sync, "content.js defines syncDomState")
        assert.match(sync, /processLinksUnder\(document\.body\)/)
        const processLink = functionBody(contentScript, "processLink")
        assert.match(processLink, /unmarkVisitedLink\(link\)/)
    })

    it("keeps marks in background-tab mode", () => {
        // Background mode only drops the target=_blank patches; reverting the
        // visual marks there as well used to disable the feature entirely.
        const sync = functionBody(contentScript, "syncDomState")
        assert.ok(sync, "content.js defines syncDomState")
        assert.match(
            sync,
            /if \(state\.openInBackground\) \{\s*removePatchedTargets\(\)\s*\}/
        )
        assert.doesNotMatch(
            sync,
            /openInBackground\) \{[^}]*removeVisitedMarks/,
            "background mode must not clear visited marks"
        )
    })

    it("stores visited URLs locally with a cap", () => {
        assert.match(contentScript, /VISITED_LINKS_LIMIT\s*=\s*2000/)
        assert.match(
            contentScript,
            /chrome\.storage\.local\s*\n?\s*\.set\(\{\s*\[STORAGE_KEY_VISITED\]/
        )
    })

    it("marks with the browser VisitedText colour and cleans up", () => {
        assert.match(
            contentScript,
            /setProperty\("color",\s*"VisitedText",\s*"important"\)/
        )
        assert.match(contentScript, /function removeVisitedMarks\(\)/)
        const sync = functionBody(contentScript, "syncDomState")
        assert.match(
            sync,
            /if \(!state\.intercepting\) \{[\s\S]*?removeVisitedMarks\(\)/
        )
    })

    it("reacts to live storage changes for visited URLs", () => {
        assert.match(
            contentScript,
            /area === "local" && changes\[STORAGE_KEY_VISITED\]/
        )
        assert.match(contentScript, /function syncVisitedMarks\(\)/)
    })

    it("does not patch same-document hash-only anchors with target=_blank", () => {
        const patch = functionBody(contentScript, "patchLinkTarget")
        assert.ok(patch, "content.js defines patchLinkTarget")
        assert.match(patch, /shouldSkipHref\(link\.getAttribute\("href"\)\)/)
    })

    it("exposes the preference on the options page", () => {
        assert.match(optionsHtml, /id="markVisitedLinksToggle"/)
        assert.match(
            optionsHtml,
            /id="markVisitedLinksToggle"[\s\S]{0,200}?aria-describedby="markVisitedLinksDesc"/
        )
        assert.match(optionsScript, /function getMarkVisitedLinksPreference/)
        assert.match(optionsScript, /function setMarkVisitedLinksPreference/)
        assert.match(
            optionsScript,
            /markVisitedLinksToggle\.checked =\s*await getMarkVisitedLinksPreference\(\)/
        )
        assert.match(
            optionsScript,
            /setMarkVisitedLinksPreference\(\s*markVisitedLinksToggle\.checked/
        )
        for (const key of ["markVisitedLinksLabel", "markVisitedLinksDesc"]) {
            assert.match(enLocale, new RegExp(`"${key}"`))
        }
    })
})

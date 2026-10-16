import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const contentScript = readFileSync(join(root, "extension/content.js"), "utf8")
const optionsScript = readFileSync(join(root, "extension/options.js"), "utf8")
const optionsHtml = readFileSync(join(root, "extension/options.html"), "utf8")
const enLocale = readFileSync(
    join(root, "shared/locales/ext/en.json"),
    "utf8"
)

describe("extension visited-link marking", () => {
    it("is always on with no preference state", () => {
        assert.doesNotMatch(contentScript, /markVisitedLinks/)
        assert.doesNotMatch(contentScript, /STORAGE_KEY_MARK_VISITED/)
        assert.match(contentScript, /rememberVisit\(link\)/)
        assert.match(
            contentScript,
            /function processLink\(link\) \{[\s\S]*?markVisitedLink\(link\)/
        )
    })

    it("stores visited URLs locally with a cap", () => {
        assert.match(contentScript, /VISITED_LINKS_LIMIT\s*=\s*2000/)
        assert.match(
            contentScript,
            /chrome\.storage\.local\s*\n?\s*\.set\(\{\s*\[STORAGE_KEY_VISITED\]/
        )
    })

    it("marks clicks and renders marks from the same pipeline", () => {
        const handler = contentScript.match(
            /function handleLinkClick\(event\) \{([\s\S]*?)\n {4}\}/
        )?.[1]
        assert.ok(handler, "content.js defines handleLinkClick")
        assert.match(handler, /rememberVisit\(link\)/)
        assert.match(contentScript, /markVisitedLink\(link\)/)
    })

    it("marks with the browser VisitedText colour and cleans up", () => {
        assert.match(
            contentScript,
            /setProperty\("color",\s*"VisitedText",\s*"important"\)/
        )
        assert.match(contentScript, /function removeVisitedMarks\(\)/)
        assert.match(
            contentScript,
            /function teardownPatching\(\) \{[\s\S]*?removeVisitedMarks\(\)/
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
        const patch = contentScript.match(
            /function patchLinkTarget\(link\) \{([\s\S]*?)\n {4}\}/
        )?.[1]
        assert.ok(patch, "content.js defines patchLinkTarget")
        assert.match(patch, /shouldSkipHref\(link\.getAttribute\("href"\)\)/)
        assert.match(
            contentScript,
            /shouldSkipHref/
        )
    })

    it("has no options toggle or preference UI for visited marking", () => {
        assert.doesNotMatch(optionsScript, /markVisitedLinks/)
        assert.doesNotMatch(optionsHtml, /markVisitedLinks/)
        assert.doesNotMatch(enLocale, /markVisitedLinksLabel/)
        assert.doesNotMatch(enLocale, /markVisitedLinksDesc/)
    })
})

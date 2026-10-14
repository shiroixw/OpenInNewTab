import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const contentScript = readFileSync(join(root, "extension/content.js"), "utf8")
const optionsScript = readFileSync(join(root, "extension/options.js"), "utf8")
const optionsHtml = readFileSync(join(root, "extension/options.html"), "utf8")

describe("extension visited-link marking", () => {
    it("defaults the setting to on in the content script", () => {
        assert.match(
            contentScript,
            /markVisitedLinks:\s*true/
        )
        assert.match(
            contentScript,
            /result\.markVisitedLinks\s*!==\s*false/
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
        assert.match(
            contentScript,
            /if \(state\.markVisitedLinks\) markVisitedLink\(link\)/
        )
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

    it("reacts to live storage changes for marks and the setting", () => {
        assert.match(
            contentScript,
            /area === "local" && changes\[STORAGE_KEY_VISITED\]/
        )
        assert.match(contentScript, /function syncVisitedMarks\(\)/)
    })

    it("options toggle reads and writes the same sync key", () => {
        assert.match(
            optionsScript,
            /chrome\.storage\.sync\.get\(\["markVisitedLinks"\]\)/
        )
        assert.match(
            optionsScript,
            /chrome\.storage\.sync\.set\(\{ markVisitedLinks: enabled \}\)/
        )
        assert.match(
            optionsHtml,
            /id="markVisitedLinksToggle"[^>]*aria-label=/
        )
    })
})

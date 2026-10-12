import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const script = readFileSync(
    join(root, "userscript/OpenInNewTab.user.js"),
    "utf8"
)

describe("userscript visited-link setting", () => {
    it("defaults to on in the single DEFAULT_SETTINGS source", () => {
        assert.match(
            script,
            /DEFAULT_SETTINGS = Object\.freeze\(\{[^}]*markVisitedLinks: true/s
        )
    })

    it("loads the stored value with the shared default and honours false", () => {
        assert.match(
            script,
            /GM_getValue\(\s*STORAGE_KEY_MARK_VISITED,\s*DEFAULT_SETTINGS\.markVisitedLinks\s*\)/
        )
    })

    it("renders the checkbox from the same setting the logic reads", () => {
        assert.match(
            script,
            /id="oint-visited-toggle" \$\{\s*settings\.markVisitedLinks \? "checked" : ""/
        )
        assert.match(script, /if \(state\.settings\.markVisitedLinks\) markVisitedLink\(link\)/)
        assert.match(script, /if \(state\.settings\.markVisitedLinks\) rememberVisit\(link\)/)
    })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { extractSection } from "../scripts/changelog-section.mjs"

const CHANGELOG = `# Changelog

## Userscript

### [1.8.0] — 2026-10-11

#### Added
- Userscript thing.

### [1.7.1] — 2026-05-30

#### Changed
- Older userscript thing.

---

## Extension

### [1.7.5] — 2026-10-24

#### Fixed
- Shadow-root clicks.

### [1.7.4] — 2026-10-24

#### Removed
- Visited-link marking.
`

describe("changelog-section", () => {
    it("returns the body of the requested extension version", () => {
        const section = extractSection(CHANGELOG, "Extension", "1.7.5")
        assert.match(section, /#### Fixed/)
        assert.match(section, /Shadow-root clicks\./)
        assert.doesNotMatch(section, /Visited-link marking/)
    })

    it("stops at the next version heading", () => {
        const section = extractSection(CHANGELOG, "Extension", "1.7.4")
        assert.match(section, /Visited-link marking/)
        assert.doesNotMatch(section, /Shadow-root clicks/)
    })

    it("keeps the two products apart", () => {
        assert.equal(extractSection(CHANGELOG, "Extension", "1.8.0"), null)
        assert.equal(extractSection(CHANGELOG, "Userscript", "1.7.5"), null)
        assert.match(
            extractSection(CHANGELOG, "Userscript", "1.8.0"),
            /Userscript thing/
        )
    })

    it("returns null for unknown products and versions", () => {
        assert.equal(extractSection(CHANGELOG, "Website", "1.7.5"), null)
        assert.equal(extractSection(CHANGELOG, "Extension", "9.9.9"), null)
    })

    it("treats dots in the version literally", () => {
        // "1x7x5" must not match a `1.7.5` heading.
        assert.equal(extractSection(CHANGELOG, "Extension", "1x7x5"), null)
    })
})

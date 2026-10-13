import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

/**
 * Files that opted into `tsc` with an `// @ts-check` pragma. `tsconfig.json`
 * keeps `checkJs` off on purpose, so deleting a pragma would silently drop
 * coverage to zero while `lint:tsc` stayed green — this list is the guard.
 */
const OPTED_IN = ["shared/i18n.js", "extension/link-policy.js"]

/**
 * Files emitted by `scripts/sync-locales.mjs`. They are byte-for-byte copies
 * of `shared/i18n.js` plus a locale table, so checking them would collide on
 * the shared global scope instead of catching anything new.
 */
const GENERATED = ["extension/i18n-bundle.js", "website/i18n.js"]

const tsconfig = readFileSync(join(root, "tsconfig.json"), "utf8")

describe("type-check contract", () => {
    for (const file of OPTED_IN) {
        it(`${file} opts into tsc`, () => {
            const source = readFileSync(join(root, file), "utf8")
            assert.match(
                source,
                /^\/\/ @ts-check$/m,
                `${file} must keep its '// @ts-check' pragma`
            )
        })
    }

    it("keep checkJs off so coverage grows per file", () => {
        assert.match(tsconfig, /"checkJs":\s*false/)
    })

    it("declares the DOM lib the browser-side runtimes need", () => {
        assert.match(tsconfig, /"lib":\s*\[[^\]]*"DOM"/)
    })

    for (const file of GENERATED) {
        it(`${file} is excluded from tsc`, () => {
            assert.ok(
                tsconfig.includes(`"${file}"`),
                `${file} must stay in tsconfig.json "exclude"`
            )
        })
    }

    it("covers every JS surface in the include list", () => {
        for (const tree of ["extension/", "userscript/", "website/", "shared/"]) {
            assert.ok(
                tsconfig.includes(`"${tree}**/*.js"`),
                `tsconfig.json include must cover ${tree}`
            )
        }
    })
})

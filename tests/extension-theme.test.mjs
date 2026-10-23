import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { describe, it } from "node:test"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(join(root, "extension/theme.js"), "utf8")

/**
 * Evaluate theme.js in a fake extension page.
 * @param {boolean} prefersDark
 * @param {{ legacyOnly?: boolean }} [options]
 */
function load(prefersDark, options = {}) {
    const body = { dataset: {}, style: {} }
    const listeners = []
    const query = {
        matches: prefersDark,
        media: "(prefers-color-scheme: dark)",
    }
    if (options.legacyOnly) {
        query.addListener = (handler) => listeners.push(handler)
    } else {
        query.addEventListener = (_type, handler) => listeners.push(handler)
    }

    const context = vm.createContext({
        document: { body },
        matchMedia: () => query,
    })
    vm.runInContext(source, context)
    return { theme: context.OINTTheme, body, listeners }
}

describe("extension theme runtime", () => {
    it("honours an explicit preference over the OS scheme", () => {
        assert.equal(load(false).theme.resolveScheme("dark"), "dark")
        assert.equal(load(true).theme.resolveScheme("light"), "light")
    })

    it("follows the OS scheme for auto", () => {
        assert.equal(load(true).theme.resolveScheme("auto"), "dark")
        assert.equal(load(false).theme.resolveScheme("auto"), "light")
        // Anything unrecognised falls back to the OS rather than a stale theme.
        assert.equal(load(true).theme.resolveScheme("sepia"), "dark")
    })

    it("applies the resolved scheme to the data attribute and color-scheme", () => {
        const page = load(true)
        const scheme = page.theme.apply("auto")
        assert.equal(scheme, "dark")
        assert.equal(page.body.dataset.colorScheme, "dark")
        assert.equal(page.body.style.colorScheme, "dark")
    })

    it("subscribes to OS changes so auto stays live", () => {
        const page = load(false)
        let calls = 0
        page.theme.watchSystem(() => {
            calls += 1
        })
        assert.equal(page.listeners.length, 1)
        page.listeners[0]()
        assert.equal(calls, 1)
    })

    it("falls back to the deprecated addListener when needed", () => {
        const page = load(false, { legacyOnly: true })
        page.theme.watchSystem(() => {})
        assert.equal(page.listeners.length, 1)
    })
})

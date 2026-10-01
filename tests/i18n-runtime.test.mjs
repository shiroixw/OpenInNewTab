import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import vm from "node:vm"

const source = readFileSync(new URL("../shared/i18n.js", import.meta.url), "utf8")

/**
 * Evaluate the shared i18n runtime the way a browser sees it.
 *
 * `shared/i18n.js` is a classic script: it declares `createI18n` at the top
 * level and ships no exports, because `scripts/sync-locales.mjs` concatenates
 * it into the extension bundle and the website bundle. A fresh VM context
 * reproduces that same "one global function, no module system" shape without
 * asking the file to grow an export it never had.
 *
 * @param {Record<string, unknown>} [globals] Extra globals, e.g. `navigator`.
 * @returns {Function} the runtime's `createI18n` factory
 */
function loadCreateI18n(globals = {}) {
    const context = vm.createContext({ ...globals })
    vm.runInContext(source, context)
    return context.createI18n
}

/** A minimal catalog: `zh-TW` is deliberately missing `onlyEn`. */
const catalog = {
    en: { greeting: "Hello {name}", onlyEn: "only english", shared: "EN" },
    "zh-CN": { greeting: "你好 {name}", shared: "CN" },
    "zh-TW": { greeting: "你好 {name}", shared: "TW" },
}

const createI18n = loadCreateI18n()
const i18n = createI18n(catalog)

describe("i18n runtime: normalizeLocale", () => {
    const cases = [
        // Empty-ish input falls back to the default locale.
        [null, "en"],
        [undefined, "en"],
        ["", "en"],
        ["   ", "en"],
        ["auto", "en"],
        // Supported ids pass through untouched...
        ["en", "en"],
        ["zh-CN", "zh-CN"],
        ["zh-TW", "zh-TW"],
        // ...including when they arrive with the wrong case or a separator.
        ["zh_CN", "zh-CN"],
        ["  zh-CN  ", "zh-CN"],
        ["zh-tw", "zh-TW"],
        // Legacy bare "zh" from stored preferences.
        ["zh", "zh-CN"],
        ["zh-Hans", "zh-CN"],
        ["zh-Hans-CN", "zh-CN"],
        // Traditional-Chinese variants all collapse onto zh-TW.
        ["zh-Hant", "zh-TW"],
        ["zh-Hant-TW", "zh-TW"],
        ["zh-HK", "zh-TW"],
        ["zh-MO", "zh-TW"],
        ["zh-TW-extra", "zh-TW"],
        // Anything else is not a locale we ship.
        ["fr", "en"],
        ["EN-US", "en"],
        ["zhx", "zh-CN"],
    ]

    for (const [input, expected] of cases) {
        it(`${JSON.stringify(input)} -> ${expected}`, () => {
            assert.equal(i18n.normalizeLocale(input), expected)
        })
    }
})

describe("i18n runtime: locale detection", () => {
    it("prefers an explicit hint over the browser language", () => {
        const runtime = loadCreateI18n({ navigator: { language: "ja-JP" } })
        assert.equal(runtime().detectLocale("zh-HK"), "zh-TW")
    })

    it("reads navigator.language when no hint is given", () => {
        const runtime = loadCreateI18n({ navigator: { language: "zh-Hant" } })
        assert.equal(runtime().detectLocale(), "zh-TW")
    })

    it("falls back to the default locale when navigator is absent", () => {
        assert.equal(i18n.detectLocale(), "en")
    })
})

describe("i18n runtime: stored preferences", () => {
    it("resolves empty and legacy values through detection", () => {
        for (const stored of [null, undefined, "", "auto"]) {
            assert.equal(
                i18n.resolveStoredLocale(stored),
                i18n.detectLocale(),
                `resolveStoredLocale(${JSON.stringify(stored)})`
            )
        }
    })

    it("canonicalizes a legacy zh preference", () => {
        assert.equal(i18n.resolveStoredLocale("zh"), "zh-CN")
    })

    it("keeps the literal auto only when asked to", () => {
        assert.equal(i18n.canonicalizeStoredLocale("auto"), i18n.detectLocale())
        assert.equal(
            i18n.canonicalizeStoredLocale("auto", { allowAuto: true }),
            "auto"
        )
        assert.equal(
            i18n.canonicalizeStoredLocale("", { allowAuto: true }),
            "auto"
        )
        assert.equal(
            i18n.canonicalizeStoredLocale(undefined, { allowAuto: true }),
            "auto"
        )
    })

    it("still normalizes a real locale when auto is allowed", () => {
        assert.equal(
            i18n.canonicalizeStoredLocale("zh", { allowAuto: true }),
            "zh-CN"
        )
    })
})

describe("i18n runtime: interpolation", () => {
    it("substitutes named placeholders", () => {
        assert.equal(i18n.interpolate("Hello {name}!", { name: "Wu" }), "Hello Wu!")
    })

    it("leaves the text untouched without params", () => {
        assert.equal(i18n.interpolate("Hello {name}"), "Hello {name}")
    })

    it("keeps placeholders that have no matching param", () => {
        assert.equal(i18n.interpolate("{a} and {b}", { a: "1" }), "1 and {b}")
    })

    it("keeps a placeholder whose value is null", () => {
        assert.equal(i18n.interpolate("{a}", { a: null }), "{a}")
    })

    it("substitutes falsy values that are not null", () => {
        // 0 and "" are real values — only null/undefined mean "missing".
        assert.equal(i18n.interpolate("{n}", { n: 0 }), "0")
        assert.equal(i18n.interpolate("{s}", { s: "" }), "")
    })
})

describe("i18n runtime: getText", () => {
    it("looks the key up in the requested locale", () => {
        assert.equal(
            i18n.getText("greeting", "zh-CN", { name: "A" }),
            "你好 A"
        )
    })

    it("falls back to the default locale for a missing key", () => {
        assert.equal(i18n.getText("onlyEn", "zh-TW"), "only english")
    })

    it("falls back to the key itself when nothing matches", () => {
        assert.equal(i18n.getText("nope", "en"), "nope")
    })

    it("normalizes an unsupported locale before lookup", () => {
        assert.equal(i18n.getText("shared", "fr"), "EN")
        assert.equal(i18n.getText("shared", "zh"), "CN")
    })

    it("treats a missing locale as the default locale", () => {
        assert.equal(i18n.getText("greeting"), "Hello {name}")
    })
})

describe("i18n runtime: language select", () => {
    it("builds one option per supported locale and selects the resolved one", () => {
        const select = { innerHTML: "", value: "" }
        i18n.fillLanguageSelect(select, "zh")
        assert.equal(select.value, "zh-CN")
        for (const label of ["English", "简体中文", "繁體中文"]) {
            assert.ok(select.innerHTML.includes(label), `missing ${label}`)
        }
        assert.equal(select.innerHTML.match(/<option/g).length, 3)
    })

    it("is a no-op when the element is absent", () => {
        assert.equal(i18n.fillLanguageSelect(null, "en"), undefined)
    })
})

describe("i18n runtime: exposed contract", () => {
    it("reports the Greasy Fork language segment", () => {
        assert.equal(i18n.greasyForkLangPrefix("zh-CN"), "zh-CN")
        assert.equal(i18n.greasyForkLangPrefix("zh-TW"), "zh-TW")
        assert.equal(i18n.greasyForkLangPrefix("zh"), "zh-CN")
        assert.equal(i18n.greasyForkLangPrefix("en"), "en")
        assert.equal(i18n.greasyForkLangPrefix("fr"), "en")
    })

    it("only accepts shipped locale ids", () => {
        assert.equal(i18n.isSupportedLocale("zh-CN"), true)
        assert.equal(i18n.isSupportedLocale("en"), true)
        assert.equal(i18n.isSupportedLocale("zh"), false)
    })

    it("freezes the constants it hands out", () => {
        assert.equal(Object.isFrozen(i18n.SUPPORTED_LOCALES), true)
        assert.equal(Object.isFrozen(i18n.LOCALE_LABELS), true)
        assert.deepEqual([...i18n.SUPPORTED_LOCALES], ["en", "zh-CN", "zh-TW"])
        assert.equal(i18n.DEFAULT_LOCALE, "en")
    })

    it("aliases htmlLang to normalizeLocale", () => {
        assert.equal(i18n.htmlLang, i18n.normalizeLocale)
    })

    it("degrades to key-echo when built without a catalog", () => {
        for (const empty of [undefined, null, {}, "not an object"]) {
            const bare = createI18n(empty)
            assert.equal(bare.getText("someKey"), "someKey")
            assert.equal(bare.DEFAULT_LOCALE, "en")
        }
    })
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import { loadUpdateNotices } from "../scripts/load-update-notices.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(
    readFileSync(join(root, "extension/manifest.json"), "utf8")
)

const {
    getUpdateNotice,
    listUpdateNoticeVersions,
    resolveNoticeCopy,
    validateUpdateNotice,
    shouldShowUpdateNotice,
} = loadUpdateNotices()

const notifyNotice = {
    showUpdateNotice: true,
    en: { title: "A title" },
    "zh-CN": { title: "标题" },
    "zh-TW": { title: "標題" },
}

describe("shipped notices", () => {
    it("documents the running version", () => {
        // The popup only asks about `manifest.version`, so a missing entry is
        // invisible at runtime by design — the gate has to catch it.
        assert.ok(
            getUpdateNotice(manifest.version),
            `extension/update-notices.js needs an entry for ${manifest.version}`
        )
    })

    it("every entry is well formed", () => {
        for (const version of listUpdateNoticeVersions()) {
            const notice = getUpdateNotice(version)
            assert.ok(notice, `${version}: entry is not an object`)
            assert.deepEqual(
                validateUpdateNotice(notice),
                [],
                `${version}: ${JSON.stringify(validateUpdateNotice(notice))}`
            )
        }
    })
})

describe("getUpdateNotice", () => {
    it("returns the entry for an exact version", () => {
        const notice = getUpdateNotice(manifest.version)
        assert.ok(notice)
        assert.equal(typeof notice.showUpdateNotice, "boolean")
        assert.equal(getUpdateNotice("0.0.0"), null)
    })

    it("ignores inherited and malformed keys", () => {
        for (const input of [
            "toString",
            "constructor",
            "__proto__",
            "",
            "1",
            null,
            undefined,
            42,
        ]) {
            assert.equal(getUpdateNotice(input), null)
        }
    })
})

describe("resolveNoticeCopy", () => {
    it("prefers the requested locale and falls back to English", () => {
        assert.deepEqual(resolveNoticeCopy(notifyNotice, "zh-CN"), {
            title: "标题",
        })
        assert.deepEqual(resolveNoticeCopy(notifyNotice, "fr"), {
            title: "A title",
        })
        assert.equal(resolveNoticeCopy(null, "en"), null)
    })
})

describe("validateUpdateNotice", () => {
    it("accepts a complete trilingual notice", () => {
        assert.deepEqual(validateUpdateNotice(notifyNotice), [])
    })

    it("accepts a silent entry with no copy", () => {
        assert.deepEqual(validateUpdateNotice({ showUpdateNotice: false }), [])
    })

    it("rejects a non-object", () => {
        for (const input of [null, undefined, "notice", 42, []]) {
            assert.deepEqual(validateUpdateNotice(input), [
                "notice must be an object",
            ])
        }
    })

    it("requires a boolean flag", () => {
        assert.deepEqual(validateUpdateNotice({}), [
            "showUpdateNotice must be a boolean",
        ])
    })

    it("requires every shipped locale", () => {
        const errors = validateUpdateNotice({
            ...notifyNotice,
            "zh-TW": undefined,
        })
        assert.deepEqual(errors, ["zh-TW: missing copy"])
    })

    it("requires non-empty copy fields", () => {
        const errors = validateUpdateNotice({
            ...notifyNotice,
            en: { title: "  " },
        })
        assert.deepEqual(errors, ["en.title must be a non-empty string"])
    })

    it("treats an array locale block as missing", () => {
        assert.deepEqual(
            validateUpdateNotice({ ...notifyNotice, en: ["A title"] }),
            ["en: missing copy"]
        )
    })
})

describe("shouldShowUpdateNotice", () => {
    it("shows a valid notify entry and nothing else", () => {
        assert.equal(shouldShowUpdateNotice(notifyNotice), true)
        assert.equal(
            shouldShowUpdateNotice({ showUpdateNotice: false }),
            false
        )
        assert.equal(
            shouldShowUpdateNotice({
                ...notifyNotice,
                en: { title: "" },
            }),
            false
        )
        assert.equal(shouldShowUpdateNotice(null), false)
        assert.equal(shouldShowUpdateNotice(undefined), false)
    })
})

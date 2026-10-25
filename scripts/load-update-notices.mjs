/**
 * Loader for `extension/update-notices.js`.
 *
 * The file is a classic script that publishes itself on `globalThis` — the same
 * contract the popup relies on. Evaluating it in this realm therefore tests the
 * artifact that actually ships, instead of a `module.exports` shim that only
 * Node can see (and that would need a bundler story in the browser).
 *
 * `runInThisContext` rather than a fresh `createContext`: objects created in a
 * separate vm realm carry that realm's prototypes, which makes every
 * `assert.deepEqual` in the tests fail on identity rather than content.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const NOTICES_FILE = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "extension",
    "update-notices.js"
)

/**
 * @typedef {object} UpdateNoticesApi
 * @property {(version: string) => Record<string, any> | null} getUpdateNotice
 * @property {() => string[]} listUpdateNoticeVersions
 * @property {(notice: any, locale: string) => { title: string, summary: string } | null} resolveNoticeCopy
 * @property {(notice: unknown) => string[]} validateUpdateNotice
 * @property {(notice: unknown) => boolean} shouldShowUpdateNotice
 */

/** @type {UpdateNoticesApi | null} */
let cached = null

/**
 * @returns {UpdateNoticesApi}
 */
export function loadUpdateNotices() {
    if (cached) {
        return cached
    }

    vm.runInThisContext(readFileSync(NOTICES_FILE, "utf8"), {
        filename: NOTICES_FILE,
    })

    /** @type {UpdateNoticesApi | undefined} */
    const api = globalThis.OpenInNewTabUpdateNotices
    if (!api) {
        throw new Error(
            "extension/update-notices.js must publish globalThis.OpenInNewTabUpdateNotices"
        )
    }

    cached = api
    return api
}

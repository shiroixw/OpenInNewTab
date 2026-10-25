/**
 * verify-release-notice.mjs — the release gate for update notices.
 *
 * Fails when the extension version being packaged cannot explain itself:
 *   1. `extension/update-notices.js` has an entry for `manifest.version`;
 *   2. every entry is well-formed (a notify release needs copy in all three
 *      shipped locales);
 *   3. `CHANGELOG.md` documents that version, so the "What's new" link always
 *      lands on real notes.
 *
 * Wired into `npm run pack:extension`, so it also runs in the release workflow.
 * Run standalone with `npm run release:check`.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { extractSection } from "./changelog-section.mjs"
import { loadUpdateNotices } from "./load-update-notices.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

/**
 * @param {string[]} problems
 * @returns {never}
 */
function fail(problems) {
    console.error("release:check — failed:\n")
    for (const problem of problems) {
        console.error(`- ${problem}`)
    }
    process.exit(1)
}

const manifest = JSON.parse(
    readFileSync(path.join(root, "extension", "manifest.json"), "utf8")
)
const version = manifest.version
const notices = loadUpdateNotices()

/** @type {string[]} */
const problems = []
const notice = notices.getUpdateNotice(version)

if (!notice) {
    problems.push(
        `extension/update-notices.js has no entry for ${version}. Add one:\n` +
            `\n      "${version}": { showUpdateNotice: false },\n\n` +
            "  Keep it silent for refactors and fixes nobody can see; switch it to\n" +
            "  `true` and write en / zh-CN / zh-TW copy when the release changes\n" +
            "  behaviour, defaults, permissions or data."
    )
}

// Old entries are never deleted, so a typo in one of them would otherwise sit
// there forever, unnoticed until that version is reinstalled from the store.
for (const entryVersion of notices.listUpdateNoticeVersions()) {
    const entry = notices.getUpdateNotice(entryVersion)
    if (!entry) {
        problems.push(`${entryVersion}: entry is not an object`)
        continue
    }
    for (const error of notices.validateUpdateNotice(entry)) {
        problems.push(`${entryVersion}: ${error}`)
    }
}

const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8")
if (!extractSection(changelog, "Extension", version)) {
    problems.push(
        `CHANGELOG.md has no "### [${version}]" section under "## Extension" — the notice links to it`
    )
}

if (problems.length > 0) {
    fail(problems)
}

console.log(
    `release:check — OK (extension ${version}, ${notice.showUpdateNotice ? "notice" : "silent"})`
)

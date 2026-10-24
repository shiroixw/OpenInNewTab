/**
 * changelog-section.mjs — print one release section from CHANGELOG.md.
 *
 * Usage: node scripts/changelog-section.mjs <extension|userscript> <version>
 *
 * The changelog is split per product (`## Extension`, `## Userscript`) and each
 * product owns its own SemVer track, so a version alone is ambiguous — the
 * product has to be named. Output is the section body only (no `### [x] — date`
 * heading), which is what a GitHub Release body wants.
 *
 * Exits 1 when the product or version is missing, so a release job fails loudly
 * instead of publishing empty notes.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const CHANGELOG_PATH = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "CHANGELOG.md"
)

/** Product argument → `## <heading>` in CHANGELOG.md. */
const PRODUCTS = {
    extension: "Extension",
    userscript: "Userscript",
}

/**
 * @param {string} source
 * @param {string} heading `Extension` or `Userscript`
 * @param {string} version
 * @returns {string|null}
 */
export function extractSection(source, heading, version) {
    const lines = source.split(/\r?\n/)

    const productStart = lines.findIndex(
        (line) => line.trim() === `## ${heading}`
    )
    if (productStart === -1) {
        return null
    }

    // The product section ends at the next `## ` heading (or EOF).
    let productEnd = lines.findIndex(
        (line, index) => index > productStart && /^##\s/.test(line)
    )
    if (productEnd === -1) {
        productEnd = lines.length
    }

    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const versionPattern = new RegExp(`^###\\s+\\[${escaped}\\]`)

    const versionStart = lines.findIndex(
        (line, index) =>
            index > productStart &&
            index < productEnd &&
            versionPattern.test(line)
    )
    if (versionStart === -1) {
        return null
    }

    let versionEnd = lines.findIndex(
        (line, index) =>
            index > versionStart && index < productEnd && /^###\s/.test(line)
    )
    if (versionEnd === -1) {
        versionEnd = productEnd
    }

    const body = lines
        .slice(versionStart + 1, versionEnd)
        .join("\n")
        .trim()

    return body || null
}

function main() {
    const [product, version] = process.argv.slice(2)
    const heading = PRODUCTS[product]

    if (!heading) {
        console.error(
            `changelog-section: unknown product "${product ?? ""}" (expected: ${Object.keys(PRODUCTS).join(", ")})`
        )
        process.exit(1)
    }
    if (!version) {
        console.error("changelog-section: missing version (e.g. 1.7.5)")
        process.exit(1)
    }

    let source
    try {
        source = readFileSync(CHANGELOG_PATH, "utf8")
    } catch (error) {
        console.error("changelog-section: cannot read CHANGELOG.md:", error.message)
        process.exit(1)
    }

    const section = extractSection(source, heading, version)
    if (!section) {
        console.error(
            `changelog-section: no "${version}" section under "## ${heading}"`
        )
        process.exit(1)
    }

    process.stdout.write(section + "\n")
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main()
}

/**
 * Capture 1280×800 Chrome Web Store screenshots from the real extension pages.
 *
 * Usage: npm run store:screenshots
 *
 * Chrome for Testing is recommended because recent branded Chrome builds no
 * longer load unpacked extensions from command-line flags. Set CHROME_PATH to
 * use another compatible Chromium build.
 *
 * Popup captures simulate an upgrade so the update-notes footer is visible:
 * a fresh install seeds `dismissedUpdateNotice` with the running version in
 * background.js, which would hide the line. Store shots set that key to a
 * prior version and leave `updateNoticeEnabled` on.
 */

import { spawn } from "node:child_process"
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { findChrome } from "./find-browser.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const extensionDir = path.join(root, "extension")
const outDir = path.join(root, "store", "screenshots")
const viewport = {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
}
const domains = [
    "github.com",
    "youtube.com",
    "wikipedia.org",
    "stackoverflow.com",
]

/**
 * Storage that makes the popup update-note eligible. Fresh installs seed
 * `dismissedUpdateNotice` with the installed version, so a blank profile never
 * shows the footer line. Pretend the user upgraded from a prior silent build.
 */
const upgradeNoticeStorage = {
    updateNoticeEnabled: true,
    dismissedUpdateNotice: "1.7.5",
}

class CdpConnection {
    constructor(url) {
        this.nextId = 0
        this.pending = new Map()
        this.socket = new WebSocket(url)
        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data)
            const pending = this.pending.get(message.id)
            if (!pending) {
                return
            }
            this.pending.delete(message.id)
            pending.resolve(message)
        }
        this.ready = new Promise((resolve, reject) => {
            this.socket.onopen = resolve
            this.socket.onerror = reject
        })
    }

    async command(method, params = {}) {
        await this.ready
        const id = ++this.nextId
        const result = new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
        })
        this.socket.send(JSON.stringify({ id, method, params }))
        const response = await result
        if (response.error) {
            throw new Error(`${method}: ${response.error.message}`)
        }
        return response.result
    }

    close() {
        this.socket.close()
    }
}

/**
 * The manifest refers to its name as `__MSG_extName__`, so the literal name
 * lives in the default locale bundle. Read it from source instead of asking
 * the service worker, which is not answerable on every Chromium build.
 */
function readManifestName() {
    const messages = JSON.parse(
        readFileSync(
            path.join(extensionDir, "_locales", "en", "messages.json"),
            "utf8"
        )
    )
    return messages.extName.message
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer()
        server.once("error", reject)
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address()
            server.close(() => resolve(port))
        })
    })
}

async function waitForDevTools(port) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            return await fetch(`http://127.0.0.1:${port}/json/version`).then(
                (response) => response.json()
            )
        } catch {
            await sleep(100)
        }
    }
    throw new Error("Chrome DevTools endpoint did not start")
}

async function getTargets(port) {
    return fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
        response.json()
    )
}

async function waitForTarget(port, predicate) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const target = (await getTargets(port)).find(predicate)
        if (target) {
            return target
        }
        await sleep(100)
    }
    throw new Error("Chrome target did not appear")
}

async function createTarget(browser, port, url) {
    const { targetId } = await browser.command("Target.createTarget", { url })
    return waitForTarget(port, (target) => target.id === targetId)
}

async function evaluate(page, expression, awaitPromise = false) {
    const result = await page.command("Runtime.evaluate", {
        expression,
        awaitPromise,
        returnByValue: true,
    })
    if (result.exceptionDetails) {
        throw new Error(
            result.exceptionDetails.exception?.description ||
                "Runtime evaluation failed"
        )
    }
    return result.result?.value
}

async function setViewport(page) {
    await page.command("Emulation.setDeviceMetricsOverride", viewport)
}

async function waitForPage(page, selector) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const ready = await evaluate(
            page,
            `document.readyState === "complete" && Boolean(document.querySelector(${JSON.stringify(selector)}))`
        )
        if (ready) {
            return
        }
        await sleep(100)
    }
    throw new Error(`Page did not render ${selector}`)
}

async function waitForCurrentDomain(page, expected) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const value = await evaluate(
            page,
            `document.getElementById("currentDomainValue")?.textContent?.trim() || ""`
        )
        if (value === expected) {
            return
        }
        await sleep(100)
    }
    throw new Error(`Current domain did not become ${expected}`)
}

/**
 * Confirm the notify-release footer is showing after the upgrade storage is
 * applied. Fail loudly if a capture would silently omit the whole feature.
 */
async function waitForVisibleUpdateNote(page) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const text = await evaluate(
            page,
            `(() => {
                const note = document.getElementById("updateNote");
                if (!note || note.hidden) return "";
                return document.getElementById("updateNoteText")?.textContent || "";
            })()`
        )
        if (typeof text === "string" && text.includes("v") && text.includes("·")) {
            console.log(`update note visible: ${text}`)
            return text
        }
        await sleep(100)
    }
    throw new Error(
        "Update note footer did not appear — check upgradeNoticeStorage and update-notices.js"
    )
}

async function applyCaptureFrame(page, kind, theme) {
    const frameStyle =
        kind === "popup"
            ? `
                document.body.style.colorScheme = ${JSON.stringify(theme)};
                document.documentElement.style.display = "grid";
                document.documentElement.style.placeItems = "center";
                document.documentElement.style.backgroundColor =
                    "color-mix(in srgb, var(--bg-primary) 88%, var(--bg-secondary))";
                document.body.style.zoom = "1.25";
                document.body.style.margin = "0";
                document.body.style.borderRadius = "12px";
                document.body.style.overflow = "hidden";
                document.body.style.boxShadow = "0 16px 48px var(--shadow-color)";
            `
            : `
                document.body.style.colorScheme = ${JSON.stringify(theme)};
                document.documentElement.style.backgroundColor =
                    "color-mix(in srgb, var(--bg-primary) 92%, var(--bg-secondary))";
                // 0.72 keeps Settings → Updates and the footer Release notes
                // link in the 1280×800 frame after the Updates section landed.
                document.body.style.zoom = "0.72";
                document.body.style.margin = "0 auto";
            `
    await evaluate(
        page,
        `document.documentElement.dataset.captureTheme = ${JSON.stringify(theme)};
         document.body.style.colorScheme = ${JSON.stringify(theme)};
         for (const token of [
             "--bg-primary",
             "--bg-secondary",
             "--text-primary",
             "--text-secondary",
             "--border-color",
             "--shadow-color",
             "--input-bg",
             "--input-border",
             "--input-text",
             "--color-accent",
             "--color-accent-hover",
             "--color-accent-fg",
         ]) {
             document.documentElement.style.setProperty(
                 token,
                 getComputedStyle(document.body).getPropertyValue(token)
             );
         }
         ${frameStyle}`
    )
}

async function capture(page, filename) {
    const { data } = await page.command("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
    })
    const destination = path.join(outDir, filename)
    writeFileSync(destination, Buffer.from(data, "base64"))
    const metadata = readFileSync(destination)
    if (
        metadata.toString("ascii", 1, 4) !== "PNG" ||
        metadata.readUInt32BE(16) !== viewport.width ||
        metadata.readUInt32BE(20) !== viewport.height
    ) {
        throw new Error(`${filename} is not a 1280×800 PNG`)
    }
    console.log(`wrote ${path.relative(root, destination)}`)
}

async function createExtensionPage(browser, port, extensionId, pageName) {
    const page = await createTarget(
        browser,
        port,
        `chrome-extension://${extensionId}/${pageName}`
    )
    const connection = new CdpConnection(page.webSocketDebuggerUrl)
    await connection.command("Runtime.enable")
    await connection.command("Page.enable")
    await setViewport(connection)
    await waitForPage(connection, "body")
    return connection
}

async function loadPageState(connection, storage) {
    await evaluate(
        connection,
        `chrome.storage.sync.set(${JSON.stringify(storage)})`,
        true
    )
    await connection.command("Page.reload", { ignoreCache: true })
    await waitForPage(connection, "body")
    await sleep(300)
    return connection
}

async function main() {
    mkdirSync(outDir, { recursive: true })
    const chrome = findChrome()
    const port = await findFreePort()
    const profile = mkdtempSync(path.join(os.tmpdir(), "oint-store-"))
    const process = spawn(
        chrome,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--hide-scrollbars",
            "--no-first-run",
            "--disable-sync",
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            `--load-extension=${extensionDir}`,
            `--disable-extensions-except=${extensionDir}`,
            `--window-size=${viewport.width},${viewport.height}`,
            "about:blank",
        ],
        { stdio: "ignore" }
    )
    const pages = []

    try {
        const version = await waitForDevTools(port)
        const browser = new CdpConnection(version.webSocketDebuggerUrl)
        await browser.command("Target.setDiscoverTargets", { discover: true })

        // Prefer the welcome tab opened on INSTALL — recent Chromium also ships
        // component extensions with `background.js`, and picking the first SW
        // can resolve to Gemini (or similar) instead of the unpacked load.
        // Fall back to any SW that is not a chrome:// component by matching the
        // welcome / popup path once the install listener has run.
        const welcome = await waitForTarget(
            port,
            (target) =>
                target.type === "page" &&
                target.url.startsWith("chrome-extension://") &&
                target.url.endsWith("/welcome.html")
        )
        console.log(`loaded ${welcome.url}`)

        const extensionId = new URL(welcome.url).host
        const manifestName = readManifestName()
        console.log(`extension ${extensionId}: ${manifestName}`)

        if (manifestName !== "Open In New Tab") {
            throw new Error(`Unexpected extension name: ${manifestName}`)
        }

        const background = (await getTargets(port)).find(
            (target) =>
                target.type === "service_worker" &&
                target.url ===
                    `chrome-extension://${extensionId}/background.js`
        )
        if (background) {
            console.log(`service worker ${background.url}`)
        }

        const activeSite = await createTarget(
            browser,
            port,
            "https://news.ycombinator.com/"
        )
        await browser.command("Target.activateTarget", {
            targetId: activeSite.id,
        })
        await sleep(800)

        // Close the install welcome tab so the popup's activeTab query cannot
        // land on chrome-extension://… and mark the domain Unavailable.
        for (const target of await getTargets(port)) {
            if (
                target.type === "page" &&
                target.url.endsWith("/welcome.html")
            ) {
                await browser.command("Target.closeTarget", {
                    targetId: target.id,
                })
            }
        }

        const popupStates = [
            {
                filename: "popup-light-add.png",
                theme: "light",
                language: "en",
                whitelist: domains,
            },
            {
                filename: "popup-dark-remove.png",
                theme: "dark",
                language: "en",
                whitelist: [...domains, "news.ycombinator.com"],
            },
            {
                filename: "popup-zh-light-add.png",
                theme: "light",
                language: "zh-CN",
                whitelist: domains,
            },
            {
                filename: "popup-zh-tw-light-add.png",
                theme: "light",
                language: "zh-TW",
                whitelist: domains,
            },
        ]

        const popup = await createExtensionPage(
            browser,
            port,
            extensionId,
            "popup.html"
        )
        pages.push(popup)
        for (const state of popupStates) {
            await browser.command("Target.activateTarget", {
                targetId: activeSite.id,
            })
            await loadPageState(popup, {
                userWhitelist: state.whitelist,
                userTheme: state.theme,
                userLanguage: state.language,
                openInBackground: false,
                ...upgradeNoticeStorage,
            })
            await browser.command("Target.activateTarget", {
                targetId: activeSite.id,
            })
            await waitForPage(popup, "#currentDomainValue")
            // Popup reads the active tab once on load. If Chromium still had
            // the welcome page focused across the reload, nudge once more.
            try {
                await waitForCurrentDomain(popup, "news.ycombinator.com")
            } catch {
                await browser.command("Target.activateTarget", {
                    targetId: activeSite.id,
                })
                await popup.command("Page.reload", { ignoreCache: true })
                await waitForPage(popup, "#currentDomainValue")
                await waitForCurrentDomain(popup, "news.ycombinator.com")
            }
            await waitForVisibleUpdateNote(popup)
            await sleep(300)
            await applyCaptureFrame(popup, "popup", state.theme)
            await capture(popup, state.filename)
        }
        popup.close()
        pages.pop()

        const optionStates = [
            { filename: "options-light.png", theme: "light", language: "en" },
            { filename: "options-dark.png", theme: "dark", language: "en" },
            {
                filename: "options-zh-light.png",
                theme: "light",
                language: "zh-CN",
            },
            {
                filename: "options-zh-tw-light.png",
                theme: "light",
                language: "zh-TW",
            },
        ]
        const options = await createExtensionPage(
            browser,
            port,
            extensionId,
            "options.html"
        )
        pages.push(options)
        for (const state of optionStates) {
            await loadPageState(options, {
                userWhitelist: domains,
                userTheme: state.theme,
                userLanguage: state.language,
                openInBackground: true,
                ...upgradeNoticeStorage,
            })
            await waitForPage(options, "#domainsList")
            await waitForPage(options, "#updateNoticeToggle")
            await waitForPage(options, "#releaseNotesLink")
            await applyCaptureFrame(options, "options", state.theme)
            await capture(options, state.filename)
        }
        options.close()
        pages.pop()

        browser.close()
    } finally {
        for (const page of pages) {
            page.close()
        }
        process.kill("SIGTERM")
        await sleep(300)
        try {
            rmSync(profile, { recursive: true, force: true })
        } catch {
            // Windows can keep the profile directory locked for a moment after
            // the browser exits; a leftover temp dir must not fail the run.
        }
    }
}

main().catch((error) => {
    console.error(`generate-store-screenshots: ${error.stack || error.message}`)
    process.exitCode = 1
})

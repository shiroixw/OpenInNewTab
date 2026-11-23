/**
 * Real-browser check: load the unpacked extension and verify quick-add uses a
 * live content-script probe instead of a host denylist.
 *
 * Usage:
 *   CHROME_PATH=/path/to/chrome-for-testing node scripts/verify-content-script-probe.mjs
 *
 * Exits non-zero on failure. Prints a JSON summary of each URL tried.
 */

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { findChrome } from "./find-browser.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const extensionDir = path.join(root, "extension")

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

async function attachPage(target) {
    const connection = new CdpConnection(target.webSocketDebuggerUrl)
    await connection.command("Runtime.enable")
    await connection.command("Page.enable")
    return connection
}

async function waitForPopupReady(popup) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const state = await evaluate(
            popup,
            `(() => {
                const btn = document.getElementById("quickAddBtn")
                const text = document.getElementById("quickAddBtnText")
                const hint = document.getElementById("restrictedHint")
                const domain = document.getElementById("currentDomainValue")
                const list = document.getElementById("domainsList")
                if (!btn || !text || !hint || !domain || !list) return null
                return {
                    domain: domain.textContent,
                    disabled: btn.disabled,
                    label: text.textContent,
                    hintHidden: hint.hidden,
                    hint: hint.textContent,
                    listReady: list.children.length > 0,
                }
            })()`
        )
        if (!state) {
            await sleep(50)
            continue
        }
        // Domains list is filled at the end of initialize(); until then the
        // button still shows the static HTML "Add" and looks ready too early.
        if (!state.listReady) {
            await sleep(50)
            continue
        }
        // Restricted: disabled + visible hint.
        if (state.disabled && state.hintHidden === false && state.hint) {
            return state
        }
        // Ordinary: enabled Add/Remove once the probe finished.
        if (
            !state.disabled &&
            state.label &&
            state.domain &&
            state.domain !== "Loading..." &&
            state.domain !== "N/A"
        ) {
            return state
        }
        // Restricted chrome:// tabs may leave the domain label as N/A.
        if (
            state.disabled &&
            state.hintHidden === false &&
            state.hint &&
            state.domain === "N/A"
        ) {
            return state
        }
        await sleep(50)
    }
    throw new Error("Popup did not finish initializing")
}

async function readWhitelist(page) {
    return evaluate(
        page,
        `chrome.storage.sync.get(["userWhitelist"]).then((r) =>
            Array.isArray(r.userWhitelist) ? r.userWhitelist : []
        )`,
        true
    )
}

async function setWhitelist(page, domains) {
    await evaluate(
        page,
        `chrome.storage.sync.set({ userWhitelist: ${JSON.stringify(domains)} })`,
        true
    )
}

async function navigatePage(page, url) {
    const result = await page.command("Page.navigate", { url })
    if (result.errorText) {
        throw new Error(`Page.navigate: ${result.errorText}`)
    }
    // chrome:// and store pages are slow / special; give them wall time.
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            const href = await evaluate(page, "location.href")
            if (typeof href === "string" && href !== "about:blank") {
                await sleep(600)
                return href
            }
        } catch {
            // Navigation in flight.
        }
        await sleep(100)
    }
    throw new Error(`Failed to navigate to ${url}`)
}

async function waitForExtensionApis(page) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const ready = await evaluate(
            page,
            `Boolean(globalThis.chrome && chrome.storage && chrome.storage.sync && chrome.tabs)`
        )
        if (ready) {
            return
        }
        await sleep(50)
    }
    throw new Error("Extension page never exposed chrome.storage / chrome.tabs")
}

async function openPopup(browser, port, extensionId) {
    const target = await createTarget(
        browser,
        port,
        `chrome-extension://${extensionId}/popup.html`
    )
    const page = await attachPage(target)
    await waitForExtensionApis(page)
    return { target, page }
}

async function closePopup(browser, popup) {
    try {
        await browser.command("Target.closeTarget", {
            targetId: popup.target.id,
        })
    } catch {
        // Already gone.
    }
    try {
        popup.page.close()
    } catch {
        // Already closed.
    }
}

async function main() {
    const chrome = findChrome()
    const port = await findFreePort()
    const profile = mkdtempSync(path.join(os.tmpdir(), "oint-probe-"))
    const child = spawn(
        chrome,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--disable-sync",
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${profile}`,
            `--load-extension=${extensionDir}`,
            `--disable-extensions-except=${extensionDir}`,
            "about:blank",
        ],
        { stdio: "ignore" }
    )

    /** @type {Array<Record<string, unknown>>} */
    const results = []
    let failed = false

    try {
        const version = await waitForDevTools(port)
        const browser = new CdpConnection(version.webSocketDebuggerUrl)
        await browser.command("Target.setDiscoverTargets", { discover: true })

        // Chrome for Testing may also boot built-in extension service workers.
        // Prefer the install welcome page this extension opens — its host is the
        // real unpacked id. Fall back to probing each background worker.
        let extensionId = null
        try {
            const welcome = await waitForTarget(
                port,
                (target) =>
                    target.type === "page" &&
                    typeof target.url === "string" &&
                    target.url.startsWith("chrome-extension://") &&
                    target.url.endsWith("/welcome.html")
            )
            extensionId = new URL(welcome.url).host
        } catch {
            const workers = (await getTargets(port)).filter(
                (target) =>
                    target.type === "service_worker" &&
                    typeof target.url === "string" &&
                    target.url.endsWith("/background.js")
            )
            for (const worker of workers) {
                const candidate = new URL(worker.url).host
                const probeTarget = await createTarget(
                    browser,
                    port,
                    `chrome-extension://${candidate}/popup.html`
                )
                const probePage = await attachPage(probeTarget)
                const ok = await evaluate(
                    probePage,
                    `location.protocol === "chrome-extension:" && Boolean(chrome?.runtime?.id)`
                )
                await browser.command("Target.closeTarget", {
                    targetId: probeTarget.id,
                })
                probePage.close()
                if (ok) {
                    extensionId = candidate
                    break
                }
            }
        }
        if (!extensionId) {
            throw new Error("Could not identify the unpacked extension id")
        }
        console.log(`chrome=${chrome}`)
        console.log(`extension=${extensionId}`)

        const site = await createTarget(browser, port, "about:blank")
        const sitePage = await attachPage(site)

        // Seed empty whitelist from a throwaway options page context.
        {
            const seed = await openPopup(browser, port, extensionId)
            await setWhitelist(seed.page, [])
            await closePopup(browser, seed)
        }

        const cases = [
            {
                name: "ordinary-https",
                url: "https://example.com/",
                expectRestricted: false,
                expectAdd: "example.com",
            },
            {
                name: "chrome-extensions",
                url: "chrome://extensions/",
                expectRestricted: true,
            },
            {
                name: "chrome-web-store",
                url: "https://chromewebstore.google.com/",
                expectRestricted: true,
                optional: true,
            },
        ]

        for (const testCase of cases) {
            /** @type {Record<string, unknown>} */
            const entry = {
                name: testCase.name,
                url: testCase.url,
                expectRestricted: testCase.expectRestricted,
            }
            let popup = null
            try {
                await browser.command("Target.activateTarget", {
                    targetId: site.id,
                })
                try {
                    entry.finalUrl = await navigatePage(sitePage, testCase.url)
                    entry.reachable = true
                } catch (error) {
                    entry.reachable = false
                    entry.error = String(error.message || error)
                    if (testCase.optional) {
                        entry.skipped = true
                        results.push(entry)
                        console.log(`SKIP ${testCase.name}: ${entry.error}`)
                        continue
                    }
                    throw error
                }

                // Opening popup.html as a tab steals "active". Put focus back on
                // the site, then reload the popup in the background so
                // initialize()'s tabs.query sees the site — same window, site
                // active, popup just a background tab.
                popup = await openPopup(browser, port, extensionId)
                await browser.command("Target.activateTarget", {
                    targetId: site.id,
                })
                await sleep(100)
                await popup.page.command("Page.reload", { ignoreCache: true })
                await waitForExtensionApis(popup.page)

                const tabInfo = await evaluate(
                    popup.page,
                    `chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => ({
                        id: tabs[0] && tabs[0].id,
                        url: tabs[0] && tabs[0].url,
                    }))`,
                    true
                )
                entry.activeTab = tabInfo

                if (typeof tabInfo?.id === "number") {
                    entry.directProbe = await evaluate(
                        popup.page,
                        `(async () => {
                            try {
                                const response = await chrome.tabs.sendMessage(
                                    ${JSON.stringify(tabInfo.id)},
                                    { type: "OINT_PING" }
                                )
                                return { ok: true, response }
                            } catch (error) {
                                return {
                                    ok: false,
                                    message:
                                        error && error.message
                                            ? error.message
                                            : String(error),
                                }
                            }
                        })()`,
                        true
                    )
                }

                const before = await readWhitelist(popup.page)
                entry.whitelistBefore = before

                const state = await waitForPopupReady(popup.page)
                entry.popup = state
                const restricted =
                    state.disabled === true && state.hintHidden === false
                entry.observedRestricted = restricted

                if (restricted !== testCase.expectRestricted) {
                    entry.ok = false
                    failed = true
                } else {
                    entry.ok = true
                }

                await evaluate(
                    popup.page,
                    `document.getElementById("quickAddBtn").click()`
                )
                await sleep(400)
                const after = await readWhitelist(popup.page)
                entry.whitelistAfter = after

                if (testCase.expectRestricted) {
                    if (JSON.stringify(after) !== JSON.stringify(before)) {
                        entry.ok = false
                        entry.writeLeak = true
                        failed = true
                    }
                } else if (testCase.expectAdd) {
                    if (!after.includes(testCase.expectAdd)) {
                        entry.ok = false
                        entry.missingAdd = true
                        failed = true
                    } else {
                        await setWhitelist(popup.page, [])
                    }
                }

                results.push(entry)
                console.log(
                    `${entry.ok ? "PASS" : "FAIL"} ${testCase.name} restricted=${restricted} url=${entry.finalUrl}`
                )
            } catch (error) {
                entry.ok = false
                entry.error = String(error.message || error)
                failed = true
                results.push(entry)
                console.log(`FAIL ${testCase.name}: ${entry.error}`)
            } finally {
                if (popup) {
                    await closePopup(browser, popup)
                }
            }
        }

        browser.close()
        console.log(JSON.stringify({ results }, null, 2))
    } finally {
        child.kill("SIGKILL")
        try {
            rmSync(profile, { recursive: true, force: true })
        } catch {
            // Best-effort cleanup.
        }
    }

    if (failed) {
        process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})

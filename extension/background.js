/**
 * Background Script - Open In New Tabs Extension
 * Service worker: install defaults, welcome page, tab creation.
 */

const MSG_OPEN_TAB = "OPEN_TAB"

chrome.runtime.onInstalled.addListener((details) => {
    // 1.7.4 removed visited-link marking. Drop the URL list it kept, so an
    // upgraded install does not carry up to 2000 visited URLs forever.
    chrome.storage.local.remove("visitedLinks")

    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.storage.sync.get(
            ["userWhitelist", "openInBackground", "dismissedUpdateNotice"],
            (result) => {
                const updates = {}
                if (!result.userWhitelist) {
                    updates.userWhitelist = []
                }
                if (result.openInBackground === undefined) {
                    updates.openInBackground = false
                }
                // A fresh install is not an upgrade: the welcome page already
                // introduced the extension, so the popup must not greet the
                // user with an "update note" for a version they never had.
                if (result.dismissedUpdateNotice === undefined) {
                    updates.dismissedUpdateNotice =
                        chrome.runtime.getManifest().version
                }
                if (Object.keys(updates).length > 0) {
                    chrome.storage.sync.set(updates)
                }
            }
        )

        chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") })
    }
})

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== MSG_OPEN_TAB || !message.url) {
        return
    }

    const createProperties = {
        url: message.url,
        active: message.active === true,
    }

    if (sender.tab?.index !== undefined) {
        createProperties.index = sender.tab.index + 1
    }

    chrome.tabs.create(createProperties).catch((error) => {
        // e.g. a URL the extension is not allowed to open — keep the service
        // worker from throwing an uncaught rejection.
        console.error("Error creating tab:", error)
    })
})

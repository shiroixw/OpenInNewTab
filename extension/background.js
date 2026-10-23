/**
 * Background Script - Open In New Tabs Extension
 * Service worker: install defaults, welcome page, tab creation.
 */

const MSG_OPEN_TAB = "OPEN_TAB"

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
        chrome.storage.sync.get(
            ["userWhitelist", "openInBackground", "markVisitedLinks"],
            (result) => {
                const updates = {}
                if (!result.userWhitelist) {
                    updates.userWhitelist = []
                }
                if (result.openInBackground === undefined) {
                    updates.openInBackground = false
                }
                if (result.markVisitedLinks === undefined) {
                    // On by default: an absent key must behave like the
                    // pre-preference releases so upgrades change nothing.
                    updates.markVisitedLinks = true
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

/**
 * Popup Script - Open In New Tab Extension
 * Handles whitelist management in the extension popup
 */

;(function () {
    "use strict"

    /** Shared i18n runtime (loaded via i18n-bundle.js before popup.js). */
    const i18n = window.I18n
    let currentLanguage = i18n.DEFAULT_LOCALE

    /**
     * Whitelist policy — the exact module the content script matches with, so
     * adding/removing entries here can never disagree with what the page does.
     * Classic scripts cannot import statically; one shared promise keeps it to
     * a single fetch per popup.
     */
    const policyReady = import(chrome.runtime.getURL("link-policy.js"))
    /** @type {typeof import("./link-policy.js") | null} */
    let policy = null

    /**
     * @returns {Promise<typeof import("./link-policy.js")>}
     */
    async function getPolicy() {
        if (!policy) {
            policy = await policyReady
        }
        return policy
    }

    let currentDomain = ""

    let currentTheme = "auto"

    /**
     * Get theme preference from storage
     * @returns {Promise<string>} Theme preference ('light', 'dark', or 'auto')
     */
    async function getThemePreference() {
        try {
            const result = await chrome.storage.sync.get(["userTheme"])
            return result.userTheme || "auto"
        } catch (error) {
            console.error("Error getting theme preference:", error)
            return "auto"
        }
    }

    /**
     * Set theme preference to storage
     * @param {string} theme Theme to save
     */
    async function setThemePreference(theme) {
        try {
            await chrome.storage.sync.set({ userTheme: theme })
            currentTheme = theme
        } catch (error) {
            console.error("Error saving theme preference:", error)
        }
    }

    /**
     * Apply theme to document
     * @param {string} theme Theme to apply ('light', 'dark', or 'auto')
     */
    function applyTheme(theme) {
        window.OINTTheme.apply(theme)

        // Update active state of theme buttons
        document.querySelectorAll(".theme-option").forEach((btn) => {
            if (btn.getAttribute("data-theme") === theme) {
                btn.classList.add("active")
            } else {
                btn.classList.remove("active")
            }
        })
    }

    /**
     * Get language preference from storage, falling back to browser language.
     * Legacy stored "zh" canonicalizes to "zh-CN".
     * @returns {Promise<string>} BCP-47 locale code
     */
    async function getLanguagePreference() {
        try {
            const result = await chrome.storage.sync.get(["userLanguage"])
            return i18n.resolveStoredLocale(result.userLanguage)
        } catch (error) {
            console.error("Error getting language preference:", error)
            return i18n.detectLocale()
        }
    }

    /**
     * Set language preference to storage
     * @param {string} lang Language to save
     */
    async function setLanguagePreference(lang) {
        try {
            await chrome.storage.sync.set({ userLanguage: lang })
        } catch (error) {
            console.error("Error saving language preference:", error)
        }
    }

    /**
     * Get open-in-background preference from storage
     * @returns {Promise<boolean>}
     */
    async function getOpenInBackgroundPreference() {
        try {
            const result = await chrome.storage.sync.get(["openInBackground"])
            return !!result.openInBackground
        } catch (error) {
            console.error("Error getting openInBackground:", error)
            return false
        }
    }

    /**
     * Set open-in-background preference to storage
     * @param {boolean} enabled
     */
    async function setOpenInBackgroundPreference(enabled) {
        try {
            await chrome.storage.sync.set({ openInBackground: enabled })
        } catch (error) {
            console.error("Error saving openInBackground:", error)
        }
    }

    /**
     * Get text by language
     * @param {string} key Text key
     * @returns {string} Localized text
     */
    function getText(key) {
        return i18n.getText(key, currentLanguage)
    }

    /**
     * Update UI language
     */
    async function updateLanguage(lang) {
        if (lang) {
            currentLanguage = lang
        } else {
            currentLanguage = await getLanguagePreference()
        }

        // Update main UI elements
        document.getElementById("modalTitle").textContent =
            getText("modalTitle")
        document.getElementById("currentDomainLabel").textContent =
            getText("currentDomainLabel")
        document.getElementById("whitelistTitle").textContent =
            getText("whitelistTitle")

        // Update settings modal elements
        document.getElementById("settingsTitle").textContent =
            getText("settingsTitle")
        document.getElementById("settingsButton").title =
            getText("settingsButtonTitle")
        document.getElementById("modalCloseBtn").title =
            getText("closeSettingsButtonLabel")
        document.getElementById("modalCloseBtn").setAttribute(
            "aria-label",
            getText("closeSettingsButtonLabel")
        )
        document.getElementById("themeLabel").textContent =
            getText("themeLabel")
        document.getElementById("themeLightText").textContent =
            getText("themeLightText")
        document.getElementById("themeDarkText").textContent =
            getText("themeDarkText")
        document.getElementById("themeAutoText").textContent =
            getText("themeAutoText")
        document.getElementById("languageLabel").textContent =
            getText("languageLabel")
        document.getElementById("openInBackgroundLabel").textContent =
            getText("openInBackgroundLabel")
        document.getElementById("openInBackgroundDesc").textContent =
            getText("openInBackgroundDesc")
        document.querySelector(".toggle-switch").title =
            getText("openInBackgroundTitle")
        document.getElementById("openInBackgroundToggle").setAttribute(
            "aria-label",
            getText("openInBackgroundTitle")
        )
        document.getElementById("moreOptionsText").textContent =
            getText("moreSettings")

        // Populate the language select from the shared locale labels
        i18n.fillLanguageSelect(
            document.getElementById("languageSelect"),
            currentLanguage
        )

        // Update quick add button label synchronously from its current state
        syncQuickAddLabel()

        // Update existing remove buttons
        document.querySelectorAll(".remove-btn").forEach((btn) => {
            btn.textContent = getText("removeButton")
        })

        // When the whitelist is empty the placeholder text needs refreshing;
        // populated rows keep their existing DOM nodes (their labels were
        // updated above), so a language switch causes only one layout pass.
        const emptyState = document.querySelector("#domainsList .empty-state")
        if (emptyState) {
            emptyState.textContent = getText("noDomains")
        }

        document.documentElement.lang = i18n.normalizeLocale(currentLanguage)
    }

    /**
     * Get current active tab domain
     * @returns {Promise<string>} Current domain
     */
    async function getCurrentDomain() {
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true,
            })
            if (tab && tab.url) {
                const url = new URL(tab.url)
                return url.hostname
            }
            return ""
        } catch (error) {
            console.error("Error getting current domain:", error)
            return ""
        }
    }

    /**
     * Update quick add button state.
     *
     * Uses `isHostAllowed` rather than an exact array lookup: the content script
     * treats a parent entry (`github.com`) as covering every subdomain, so a
     * strict `includes` here would offer "Add" on a page that is already
     * intercepted.
     */
    async function updateQuickAddButton() {
        const quickAddBtn = document.getElementById("quickAddBtn")
        const quickAddBtnText = document.getElementById("quickAddBtnText")
        const userWhitelist = await getUserWhitelist()
        const { isHostAllowed } = await getPolicy()

        if (currentDomain && isHostAllowed(currentDomain, userWhitelist)) {
            quickAddBtn.classList.add("remove-state")
            quickAddBtn.classList.remove("added")
            quickAddBtn.disabled = false
            quickAddBtnText.textContent = getText("quickAddBtnRemove")
            quickAddBtn.title = getText("quickAddBtnRemoveTitle")
        } else {
            quickAddBtn.classList.remove("added")
            quickAddBtn.classList.remove("remove-state")
            quickAddBtn.disabled = false
            quickAddBtnText.textContent = getText("quickAddBtnText")
            quickAddBtn.title = getText("quickAddBtnAddTitle")
        }
    }

    /**
     * Refresh the quick-add label synchronously from its current state.
     * Used on language switches so no storage round-trip (and thus no second
     * layout/resize pass) is needed.
     */
    function syncQuickAddLabel() {
        const quickAddBtn = document.getElementById("quickAddBtn")
        const quickAddBtnText = document.getElementById("quickAddBtnText")
        const removing = quickAddBtn.classList.contains("remove-state")
        quickAddBtnText.textContent = removing
            ? getText("quickAddBtnRemove")
            : getText("quickAddBtnText")
        quickAddBtn.title = removing
            ? getText("quickAddBtnRemoveTitle")
            : getText("quickAddBtnAddTitle")
    }

    /**
     * Handle quick add button click
     */
    async function handleQuickAdd() {
        if (!currentDomain) {
            showNotification(getText("cannotDetectCurrentDomain"))
            return
        }

        const { isHostAllowed } = await getPolicy()
        const userWhitelist = await getUserWhitelist()

        if (isHostAllowed(currentDomain, userWhitelist)) {
            await removeCurrentDomain()
            return
        }

        await addDomainToWhitelist(currentDomain)
    }

    /**
     * Repair legacy entries (scheme, mixed case, duplicates, junk) in storage
     * once, so matching, the list and the quick-add state agree from then on.
     * @returns {Promise<string[]>} The canonical list.
     */
    async function sanitizeStoredWhitelist() {
        const { sanitizeWhitelist } = await getPolicy()
        const stored = await getUserWhitelist()
        const { domains, changed } = sanitizeWhitelist(stored)
        if (changed) {
            try {
                await saveUserWhitelist(domains)
            } catch (error) {
                console.error("Error repairing whitelist:", error)
            }
        }
        return domains
    }

    /**
     * Get user whitelist from chrome storage
     * @returns {Promise<Array>} Array of whitelisted domains
     */
    async function getUserWhitelist() {
        try {
            const result = await chrome.storage.sync.get(["userWhitelist"])
            const stored = result.userWhitelist
            return Array.isArray(stored) ? stored : []
        } catch (error) {
            console.error("Error getting whitelist:", error)
            return []
        }
    }

    /**
     * Save user whitelist to chrome storage
     * @param {Array} domains Array of domains to save
     */
    async function saveUserWhitelist(domains) {
        try {
            await chrome.storage.sync.set({ userWhitelist: domains })
        } catch (error) {
            console.error("Error saving whitelist:", error)
            throw error
        }
    }

    /**
     * Show notification message
     * @param {string} message Message to display
     */
    function showNotification(message) {
        // Remove existing notification
        const existingNotification = document.querySelector(".notification")
        if (existingNotification) {
            existingNotification.remove()
        }

        // Create notification element
        const notification = document.createElement("div")
        notification.className = "notification"
        notification.textContent = message
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--color-accent);
            color: var(--color-accent-fg);
            padding: 12px 20px;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: inherit;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `

        document.body.appendChild(notification)

        // Animate in
        setTimeout(() => {
            notification.style.opacity = "1"
            notification.style.transform = "translateX(0)"
        }, 10)

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = "0"
            notification.style.transform = "translateX(100%)"
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove()
                }
            }, 300)
        }, 3000)
    }

    /**
     * Add a domain to the whitelist.
     *
     * The entry is canonicalized first and rejected when it is not a hostname or
     * already covered by a parent entry — storing either would create a row that
     * never matches anything on its own.
     * @param {string} domain Domain to add
     */
    async function addDomainToWhitelist(domain) {
        try {
            const { normalizeDomain, findCoveringDomain, mergeWhitelist } =
                await getPolicy()
            const normalized = normalizeDomain(domain)

            if (!normalized) {
                showNotification(getText("invalidDomain", { domain }))
                return
            }

            const userWhitelist = await getUserWhitelist()
            const covering = findCoveringDomain(normalized, userWhitelist)

            if (covering) {
                showNotification(
                    getText("domainAlreadyCovered", {
                        domain: normalized,
                        parent: covering,
                    })
                )
                return
            }

            const { domains } = mergeWhitelist(userWhitelist, [normalized])
            await saveUserWhitelist(domains)
            showNotification(`${normalized} ${getText("addedToWhitelist")}`)
            await loadWhitelist()
            await updateQuickAddButton()
        } catch (error) {
            console.error("Error adding domain:", error)
            showNotification(getText("errorAddingDomain"))
        }
    }

    /**
     * Remove one whitelist row (the list's own Remove button).
     * @param {string} domain Domain to remove
     */
    async function removeDomainFromWhitelist(domain) {
        try {
            const { normalizeDomain } = await getPolicy()
            const target = normalizeDomain(domain) || domain
            const userWhitelist = await getUserWhitelist()
            const index = userWhitelist.findIndex(
                (entry) =>
                    typeof entry === "string" &&
                    (normalizeDomain(entry) || entry) === target
            )

            if (index === -1) {
                return
            }

            userWhitelist.splice(index, 1)
            await saveUserWhitelist(userWhitelist)
            showNotification(`${target} ${getText("removedFromWhitelist")}`)
            await loadWhitelist()
            await updateQuickAddButton()
        } catch (error) {
            console.error("Error removing domain:", error)
            showNotification(getText("errorRemovingDomain"))
        }
    }

    /**
     * Remove the current host from the whitelist, including a parent entry that
     * covers it — otherwise "Remove" on `gist.github.com` would be a no-op while
     * `github.com` keeps intercepting the page.
     */
    async function removeCurrentDomain() {
        try {
            const { removeHostFromWhitelist } = await getPolicy()
            const userWhitelist = await getUserWhitelist()
            const { domains, removed } = removeHostFromWhitelist(
                userWhitelist,
                currentDomain
            )

            if (removed.length === 0) {
                showNotification(getText("alreadyNotInWhitelist"))
                return
            }

            await saveUserWhitelist(domains)
            showNotification(
                `${removed.join(", ")} ${getText("removedFromWhitelist")}`
            )
            await loadWhitelist()
            await updateQuickAddButton()
        } catch (error) {
            console.error("Error removing current domain:", error)
            showNotification(getText("errorRemovingDomain"))
        }
    }

    /**
     * Render whitelist rows without HTML string interpolation.
     * @param {HTMLElement} container
     * @param {string[]} domains
     * @param {string} emptyText
     * @param {string} removeLabel
     * @param {(domain: string) => void} onRemove
     */
    function renderDomainList(
        container,
        domains,
        emptyText,
        removeLabel,
        onRemove
    ) {
        container.replaceChildren()
        if (domains.length === 0) {
            const empty = document.createElement("div")
            empty.className = "empty-state"
            empty.textContent = emptyText
            container.append(empty)
            return
        }
        const fragment = document.createDocumentFragment()
        for (const domain of domains) {
            const item = document.createElement("div")
            item.className = "domain-item"
            const name = document.createElement("span")
            name.className = "domain-name"
            name.textContent = domain
            const button = document.createElement("button")
            button.type = "button"
            button.className = "remove-btn"
            button.dataset.domain = domain
            button.textContent = removeLabel
            button.addEventListener("click", () => onRemove(domain))
            item.append(name, button)
            fragment.append(item)
        }
        container.append(fragment)
    }

    /**
     * Load and display whitelist
     */
    async function loadWhitelist() {
        try {
            const userWhitelist = await getUserWhitelist()
            const domainsList = document.getElementById("domainsList")

            renderDomainList(
                domainsList,
                userWhitelist,
                getText("noDomains"),
                getText("removeButton"),
                removeDomainFromWhitelist
            )
        } catch (error) {
            console.error("Error loading whitelist:", error)
        }
    }

    /**
     * Open settings modal
     */
    function openSettingsModal() {
        const modal = document.getElementById("settingsModal")
        modal.classList.add("show")
    }

    /**
     * Close settings modal
     */
    function closeSettingsModal() {
        const modal = document.getElementById("settingsModal")
        modal.classList.remove("show")
    }

    /**
     * Initialize settings modal
     */
    async function syncOpenInBackgroundToggle() {
        const toggle = document.getElementById("openInBackgroundToggle")
        toggle.checked = await getOpenInBackgroundPreference()
    }

    function initializeSettingsModal() {
        const settingsBtn = document.getElementById("settingsButton")
        const modalCloseBtn = document.getElementById("modalCloseBtn")
        const modal = document.getElementById("settingsModal")
        const themeButtons = document.querySelectorAll(".theme-option")
        const languageSelect = document.getElementById("languageSelect")
        const openInBackgroundToggle = document.getElementById(
            "openInBackgroundToggle"
        )

        // Open modal
        settingsBtn.addEventListener("click", async () => {
            await syncOpenInBackgroundToggle()
            openSettingsModal()
        })

        // Close modal
        modalCloseBtn.addEventListener("click", closeSettingsModal)

        // Close modal when clicking outside
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                closeSettingsModal()
            }
        })

        // Theme selection
        themeButtons.forEach((btn) => {
            btn.addEventListener("click", async () => {
                const theme = btn.getAttribute("data-theme")
                await setThemePreference(theme)
                applyTheme(theme)
            })
        })

        // Language selection
        languageSelect.addEventListener("change", async (e) => {
            const lang = e.target.value
            await setLanguagePreference(lang)
            await updateLanguage(lang)
        })

        openInBackgroundToggle.addEventListener("change", async () => {
            await setOpenInBackgroundPreference(openInBackgroundToggle.checked)
        })

        // Open the full options page
        document
            .getElementById("moreOptionsBtn")
            .addEventListener("click", () => {
                chrome.runtime.openOptionsPage()
                window.close()
            })
    }

    /**
     * Initialize popup
     */
    async function initialize() {
        try {
            // Get current domain
            currentDomain = await getCurrentDomain()
            document.getElementById("currentDomainValue").textContent =
                currentDomain || "N/A"

            // Load and apply theme preference
            currentTheme = await getThemePreference()
            applyTheme(currentTheme)
            window.OINTTheme.watchSystem(() => {
                if (currentTheme === "auto") {
                    applyTheme("auto")
                }
            })

            // Load and apply language preference
            await updateLanguage()

            // Initialize settings modal
            initializeSettingsModal()

            // Set up event listeners
            const quickAddBtn = document.getElementById("quickAddBtn")

            quickAddBtn.addEventListener("click", handleQuickAdd)

            // Repair legacy entries before rendering, so the list and the
            // quick-add state reflect what the content script will match.
            await sanitizeStoredWhitelist()

            // Load initial whitelist
            await loadWhitelist()

            // Update quick add button state
            await updateQuickAddButton()
        } catch (error) {
            console.error("Error initializing popup:", error)
        }
    }

    // Initialize when DOM is loaded
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize)
    } else {
        initialize()
    }
})()

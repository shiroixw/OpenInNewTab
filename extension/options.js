/**
 * Options Script - Open In New Tab Extension
 * Handles extension settings and whitelist management
 */

;(function () {
    "use strict"

    /** Shared i18n runtime (loaded via i18n-bundle.js before options.js). */
    const i18n = window.I18n
    let currentLanguage = i18n.DEFAULT_LOCALE

    /**
     * Whitelist policy — the exact module the content script matches with, so
     * entries added here can never disagree with what the page does.
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
        const body = document.body

        if (theme === "auto") {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)"
            ).matches
            body.style.colorScheme = prefersDark ? "dark" : "light"
        } else {
            body.style.colorScheme = theme
        }

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

    async function getOpenInBackgroundPreference() {
        try {
            const result = await chrome.storage.sync.get(["openInBackground"])
            return !!result.openInBackground
        } catch (error) {
            console.error("Error getting openInBackground:", error)
            return false
        }
    }

    async function setOpenInBackgroundPreference(enabled) {
        try {
            await chrome.storage.sync.set({ openInBackground: enabled })
        } catch (error) {
            console.error("Error saving openInBackground:", error)
        }
    }

    /**
     * Whether intercepted links are recoloured with the browser's visited
     * colour. Opt-out: an absent key means on.
     * @returns {Promise<boolean>}
     */
    async function getMarkVisitedLinksPreference() {
        try {
            const result = await chrome.storage.sync.get(["markVisitedLinks"])
            return result.markVisitedLinks !== false
        } catch (error) {
            console.error("Error getting markVisitedLinks:", error)
            return true
        }
    }

    /**
     * @param {boolean} enabled
     */
    async function setMarkVisitedLinksPreference(enabled) {
        try {
            await chrome.storage.sync.set({ markVisitedLinks: enabled })
        } catch (error) {
            console.error("Error saving markVisitedLinks:", error)
        }
    }


    /**
     * Get text by language
     * @param {string} key Text key
     * @param {Object} params Parameters to replace in text
     * @returns {string} Localized text
     */
    function getText(key, params = {}) {
        return i18n.getText(key, currentLanguage, params)
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

        document.getElementById("optionsTitle").textContent =
            getText("optionsTitle")
        document.getElementById("appearanceHeading").textContent =
            getText("appearanceHeading")
        document.getElementById("themeLabel").textContent =
            getText("themeLabel")
        for (const theme of ["Light", "Dark", "Auto"]) {
            const btn = document.getElementById(`theme${theme}Btn`)
            const label = getText(`theme${theme}Text`)
            btn.title = label
            btn.setAttribute("aria-label", label)
        }
        document.getElementById("languageLabel").textContent =
            getText("languageLabel")
        document.getElementById("linkBehaviorHeading").textContent =
            getText("linkBehaviorHeading")
        document.getElementById("openInBackgroundLabel").textContent =
            getText("openInBackgroundLabel")
        document.getElementById("openInBackgroundDesc").textContent =
            getText("openInBackgroundDesc")
        const openInBackgroundToggle = document.getElementById(
            "openInBackgroundToggle"
        )
        openInBackgroundToggle.setAttribute(
            "aria-label",
            getText("openInBackgroundLabel")
        )
        openInBackgroundToggle.closest(".toggle-switch").title = getText(
            "openInBackgroundLabel"
        )
        document.getElementById("markVisitedLinksLabel").textContent =
            getText("markVisitedLinksLabel")
        document.getElementById("markVisitedLinksDesc").textContent =
            getText("markVisitedLinksDesc")
        const markVisitedLinksToggle = document.getElementById(
            "markVisitedLinksToggle"
        )
        markVisitedLinksToggle.setAttribute(
            "aria-label",
            getText("markVisitedLinksLabel")
        )
        markVisitedLinksToggle.closest(".toggle-switch").title = getText(
            "markVisitedLinksLabel"
        )
        document.getElementById("whitelistHeading").textContent =
            getText("whitelistHeading")
        document.getElementById("importExportLabel").textContent =
            getText("importExportLabel")
        document.getElementById("exportBtnText").textContent =
            getText("exportBtnText")
        document.getElementById("importBtnText").textContent =
            getText("importBtnText")
        document.getElementById("addDomainLabel").textContent =
            getText("addDomainLabel")
        document.getElementById("addBtnText").textContent =
            getText("addBtnText")
        document.getElementById("footerText").textContent = getText(
            "footerText",
            { version: chrome.runtime.getManifest().version }
        )
        document.getElementById("newDomainInput").placeholder =
            getText("inputPlaceholder")

        i18n.fillLanguageSelect(
            document.getElementById("languageSelect"),
            currentLanguage
        )

        document.querySelectorAll(".remove-btn").forEach((btn) => {
            btn.textContent = getText("removeButton")
        })

        // Refresh list text synchronously instead of rebuilding the DOM, so a
        // language switch causes a single layout pass with no transient
        // collapse of the domains list.
        const domainsList = document.getElementById("domainsList")
        const emptyState = domainsList.querySelector(".empty-state")
        const count = emptyState
            ? 0
            : domainsList.querySelectorAll(".domain-item").length
        document.getElementById("domainsCount").textContent = getText(
            "domainsCount",
            { count }
        )
        if (emptyState) {
            emptyState.textContent = getText("noDomains")
        }

        document.documentElement.lang = i18n.normalizeLocale(currentLanguage)
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
        const existingNotification = document.querySelector(".notification")
        if (existingNotification) {
            existingNotification.remove()
        }

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
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-family: inherit;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
            opacity: 0;
            transform: translateY(-20px);
            transition: all 0.3s ease;
        `

        document.body.appendChild(notification)

        setTimeout(() => {
            notification.style.opacity = "1"
            notification.style.transform = "translateY(0)"
        }, 10)

        setTimeout(() => {
            notification.style.opacity = "0"
            notification.style.transform = "translateY(-20px)"
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
     * Manual input goes through the same canonicalizer as imported data, so
     * `https://GitHub.com/x` becomes `github.com` instead of a row that never
     * matches. Entries already covered by a parent domain are reported, not
     * duplicated.
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
        } catch (error) {
            console.error("Error adding domain:", error)
            showNotification(getText("errorAddingDomain"))
        }
    }

    /**
     * Remove one whitelist row.
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
        } catch (error) {
            console.error("Error removing domain:", error)
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
            const domainsCount = document.getElementById("domainsCount")

            domainsCount.textContent = getText("domainsCount", {
                count: userWhitelist.length,
            })

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
     * Export whitelist to JSON file
     */
    async function exportWhitelist() {
        try {
            const userWhitelist = await getUserWhitelist()
            const data = {
                version: chrome.runtime.getManifest().version,
                exportDate: new Date().toISOString(),
                whitelist: userWhitelist,
            }

            const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `open-in-new-tab-whitelist-${Date.now()}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            showNotification(getText("exportSuccess"))
        } catch (error) {
            console.error("Error exporting whitelist:", error)
            showNotification(getText("errorExportingWhitelist"))
        }
    }

    /**
     * Import a whitelist JSON file.
     *
     * Entries are canonicalized and validated before they reach storage, and the
     * import merges into the existing list instead of replacing it — a malformed
     * or partial file can no longer silently wipe what the user already had.
     * @param {File} file JSON file to import
     */
    async function importWhitelist(file) {
        try {
            const { mergeWhitelist } = await getPolicy()
            const text = await file.text()
            const data = JSON.parse(text)
            const incoming = Array.isArray(data?.whitelist)
                ? data.whitelist
                : Array.isArray(data)
                  ? data
                  : null

            if (!incoming || incoming.length === 0) {
                showNotification(getText("importError"))
                return
            }

            const userWhitelist = await getUserWhitelist()
            const { domains, added, duplicate, invalid } = mergeWhitelist(
                userWhitelist,
                incoming
            )

            if (added === 0) {
                showNotification(
                    getText("importNothingAdded", { duplicate, invalid })
                )
                return
            }

            await saveUserWhitelist(domains)
            showNotification(
                getText("importSummary", {
                    added,
                    skipped: duplicate + invalid,
                })
            )
            await loadWhitelist()
        } catch (error) {
            console.error("Error importing whitelist:", error)
            showNotification(getText("importError"))
        }
    }

    /**
     * Repair legacy entries (scheme, mixed case, duplicates, junk) in storage
     * once, so the rendered list matches what the content script matches.
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
     * Initialize options page
     */
    async function initialize() {
        try {
            currentTheme = await getThemePreference()
            applyTheme(currentTheme)

            await updateLanguage()

            const themeButtons = document.querySelectorAll(".theme-option")
            themeButtons.forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const theme = btn.getAttribute("data-theme")
                    await setThemePreference(theme)
                    applyTheme(theme)
                })
            })

            const languageSelect = document.getElementById("languageSelect")
            languageSelect.addEventListener("change", async (e) => {
                const lang = e.target.value
                await setLanguagePreference(lang)
                await updateLanguage(lang)
            })

            const openInBackgroundToggle = document.getElementById(
                "openInBackgroundToggle"
            )
            openInBackgroundToggle.checked =
                await getOpenInBackgroundPreference()
            openInBackgroundToggle.addEventListener("change", async () => {
                await setOpenInBackgroundPreference(
                    openInBackgroundToggle.checked
                )
            })

            const markVisitedLinksToggle = document.getElementById(
                "markVisitedLinksToggle"
            )
            markVisitedLinksToggle.checked =
                await getMarkVisitedLinksPreference()
            markVisitedLinksToggle.addEventListener("change", async () => {
                await setMarkVisitedLinksPreference(
                    markVisitedLinksToggle.checked
                )
            })


            const addBtn = document.getElementById("addDomainBtn")
            const input = document.getElementById("newDomainInput")

            addBtn.addEventListener("click", () => {
                const domain = input.value.trim()
                if (domain) {
                    addDomainToWhitelist(domain)
                    input.value = ""
                }
            })

            input.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    addBtn.click()
                }
            })

            const exportBtn = document.getElementById("exportBtn")
            exportBtn.addEventListener("click", exportWhitelist)

            const importBtn = document.getElementById("importBtn")
            const importFileInput = document.getElementById("importFileInput")

            importBtn.addEventListener("click", () => {
                importFileInput.click()
            })

            importFileInput.addEventListener("change", (e) => {
                const file = e.target.files[0]
                if (file) {
                    importWhitelist(file)
                    importFileInput.value = ""
                }
            })

            await sanitizeStoredWhitelist()
            await loadWhitelist()
        } catch (error) {
            console.error("Error initializing options:", error)
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize)
    } else {
        initialize()
    }
})()

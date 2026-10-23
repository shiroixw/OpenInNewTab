// @ts-check
/**
 * Theme application shared by popup, options and welcome.
 *
 * The resolved scheme is published twice on <body>, from a single value so the
 * two can never disagree:
 *   - `data-color-scheme` selects our token blocks in popup.css
 *   - `color-scheme` keeps native widgets (scrollbars, form controls, focus
 *     rings) in the same scheme
 *
 * Matching on an inline `style` string (the previous approach) breaks silently
 * as soon as the declaration order or value formatting changes.
 */

;(function (global) {
    "use strict"

    const DARK_QUERY = "(prefers-color-scheme: dark)"

    /**
     * Resolve a stored preference to the scheme that is actually shown.
     * Anything other than an explicit "light" / "dark" follows the OS.
     * @param {string} theme 'light' | 'dark' | 'auto'
     * @returns {'light' | 'dark'}
     */
    function resolveScheme(theme) {
        if (theme === "light" || theme === "dark") {
            return theme
        }
        return global.matchMedia(DARK_QUERY).matches ? "dark" : "light"
    }

    /**
     * Apply a theme to the current document.
     * @param {string} theme 'light' | 'dark' | 'auto'
     * @returns {'light' | 'dark'} The scheme that was applied.
     */
    function apply(theme) {
        const scheme = resolveScheme(theme)
        const body = global.document.body
        body.dataset.colorScheme = scheme
        body.style.colorScheme = scheme
        return scheme
    }

    /**
     * Run `onChange` when the OS scheme flips, so "auto" stays live instead of
     * only catching up the next time the page opens.
     * @param {() => void} onChange
     */
    function watchSystem(onChange) {
        const query = global.matchMedia(DARK_QUERY)
        if (typeof query.addEventListener === "function") {
            query.addEventListener("change", onChange)
        } else if (typeof query.addListener === "function") {
            // Safari < 14 only exposes the deprecated form.
            query.addListener(onChange)
        }
    }

    Object.defineProperty(global, "OINTTheme", {
        value: Object.freeze({ resolveScheme, apply, watchSystem }),
        writable: false,
        configurable: false,
    })
})(globalThis)

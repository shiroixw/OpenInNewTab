# Changelog

This repository ships **two independent products** with **independent SemVer
release cycles**:

| Product | Version source | Where users see it |
| --- | --- | --- |
| Chrome extension | `extension/manifest.json` | Web Store, popup About, website footer |
| Tampermonkey userscript | `userscript/OpenInNewTab.user.js` (`// @version` + `SCRIPT_VERSION`) | Tampermonkey dashboard, settings modal About |

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

---

## Userscript

### [1.7.1] — 2026-05-30

#### Changed
- Settings modal re-skinned to match the extension's `STYLE_GUIDE.md`.
  Removed the Material green / red / orange fills, gradient buttons, and
  colour-tinted shadows. Primary buttons are now flat teal accent;
  secondary buttons and the per-domain Remove button use a neutral ghost
  style. Toast colours map to `success → accent`, `info → neutral`,
  `error → danger`. The userscript settings modal and the extension popup
  now share the same palette and component language across light and dark
  themes.
- `getThemeColors()` keys mirror `shared/STYLE_TOKENS.md`, the new
  project-wide colour-contract single source of truth.
- The userscript version is now decoupled from the extension version. The
  two ship on independent SemVer tracks; use `npm run version:bump:us` or
  `npm run version:bump:ext` to bump each track in isolation.

#### Fixed
- Toast info messages no longer use a saturated orange tint; they fall back
  to the neutral secondary text colour, matching the extension's
  notification semantics.

### [1.7.0] — 2025
- Added a full settings modal (Whitelist / Preferences / About) with theme
  and language overrides, JSON import / export, opt-in background-tab
  opening via `GM_openInTab`, non-blocking toast notifications, and a
  first-run welcome page. The userscript reached feature parity with the
  extension's link-interception behaviour.

### [1.6.0] — 2025
- Hardened the core: real click capture with `preventDefault` + `window.open`
  inside the user-gesture stack, skip rules for downloads / modifier keys /
  `javascript:` / `mailto:` / `tel:` / `#anchor`, rollbackable target
  patching, throttled `MutationObserver`, live whitelist updates without a
  page reload, dynamic menu labels, and corrected `@updateURL` /
  `@downloadURL` so auto-update works.

### Earlier
- Iterative releases prior to 1.6.0; detailed history not preserved.

---

## Extension

### Unreleased

#### Changed
- Content script now remounts interceptors when the whitelist or
  background-tab preference changes, so popup / options edits apply without
  reloading the page.
- Foreground and background opens both go through `chrome.tabs.create` from
  the service worker; the click handler stays synchronous (cached prefs).
- Skip `tel:` links; observe `href` mutations with idle-batched patching.
- Removed `web_accessible_resources` exposing popup assets to every site.
- Popup and options render domain rows with DOM APIs instead of HTML
  interpolation.

#### Fixed
- Opening a link no longer races popup blockers after `await storage`.

---

### [1.7.0] — 2025
- Settings center with theme and language overrides, JSON import / export,
  background-tab opening (`chrome.tabs.create({ active: false })`), an
  install-time welcome page, and toast notifications.

### [1.4.x] — 2025
- Version numbers unified through `extension/manifest.json`; pre-commit
  hook automated patch bumps; the website footer surfaces the release
  version.

### [1.3.x] — earlier
- Options page, theme settings, full English / Chinese i18n.

### Earlier
- Iterative releases; detailed history not preserved.

[1.7.1]: https://github.com/shiroxw/OpenInNewTab/releases
[1.7.0]: https://github.com/shiroxw/OpenInNewTab/releases
[1.6.0]: https://github.com/shiroxw/OpenInNewTab/releases
[1.4.x]: https://github.com/shiroxw/OpenInNewTab/releases
[1.3.x]: https://github.com/shiroxw/OpenInNewTab/releases

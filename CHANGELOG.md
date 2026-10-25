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

### [Unreleased]

#### Fixed
- Clicks inside a shadow root are intercepted: the anchor is resolved through
  `event.composedPath()` instead of `event.target.closest()`, which is
  retargeted to the shadow host on component-based sites.
- Link URLs come from the `href` attribute, not `.href`, so SVG anchors open at
  the real URL instead of `…/[object SVGAnimatedString]/`. Only `http(s)`
  targets are opened, and hash anchors are no longer patched with
  `target="_blank"`.
- The click listener is bound once at document-start on `window` capture, and no
  longer re-bound when the whitelist changes — a page that stops propagation in
  its own window handler cannot preempt it.

### [1.8.0] — 2026-10-11

#### Added
- **Mark visited links** preference (Settings → Preferences), on by default.
  Links opened through the script's new-tab interception are remembered (up to 2000
  URLs, stored via `GM_setValue`) and recolored with the browser's own
  `VisitedText` colour, which follows light / dark mode. Marks update live
  across tabs, apply to dynamically added links, and are removed when the
  option is turned off or the domain leaves the whitelist. Fixes #3.

#### Fixed
- Adding the current domain to the whitelist no longer requires a reload
  before the page's existing links are patched to open in a new tab.

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

### [1.8.0] — 2026-10-25

#### Added
- **Update notes in the popup.** A release that changes how the extension
  behaves can now say so in one line at the bottom of the popup —
  `v1.8.0 · <what changed>` next to a link to the full notes, dismissible, out
  of the way of the whitelist. Nothing opens by itself and no tab is taken
  over; a release marked silent shows nothing at all. Dismissing a note applies
  to that version only, and `Settings → Updates` turns the notes off.
- **Release notes from Settings.** The options page footer now shows the
  running version next to a `Release notes` link, so the changelog is reachable
  without a detour through the Web Store.
- `extension/update-notices.js` records one entry per release, `notify` or
  `silent`. `npm run release:check` — part of `npm run pack:extension` and the
  release workflow — fails the build when the version being packaged has no
  entry, when its copy is incomplete in any of the three shipped locales, or
  when `CHANGELOG.md` does not document it.

### [1.7.5] — 2026-10-24

#### Fixed
- Clicks are resolved through `event.composedPath()`, so links rendered inside a
  shadow root (Salesforce's `hgf-c360nav`, and any Lit / LWC / Stencil nav) are
  intercepted again. The click target is retargeted to the shadow host there, and
  `closest()` on it never found the anchor.
- Link URLs are resolved from the `href` attribute instead of `.href`. An SVG
  `<a>` exposes an `SVGAnimatedString`, which opened
  `…/[object SVGAnimatedString]/`. Only `http(s)` targets are opened now.
- The click listener claims the outermost capture slot: it is bound
  synchronously on `window` before the policy module is imported, so a page that
  stops propagation in its own window-capture handler can no longer swallow the
  click.
- `dev/fixture.html` is now a regression matrix for all of the above (nested and
  slotted shadow roots, SVG anchors, late-mounted hosts, a preempting page).

### [1.7.4] — 2026-10-24

#### Removed
- **Visited-link marking** is gone, together with the `visitedLinks` list it kept
  in `chrome.storage.local` (deleted on upgrade). It recoloured every link it had
  seen with `color: VisitedText !important`, which overrode each site's own link
  styling — on sites with static menus that reads as a rendering bug (#26).
  What colour a link takes after a visit is the browser's decision; this
  extension only decides where the link opens.

#### Fixed
- Theming no longer depends on matching an inline `style="color-scheme: …"`
  string. A shared `theme.js` resolves the preference once and publishes it as
  `data-color-scheme` on `<body>`, which popup.css selects on; `auto` also
  follows OS changes live instead of only on the next page open.

### [1.7.3] — 2026-10-23

#### Fixed
- Whitelist entries are canonicalized before they are stored. Pasting a URL
  (`https://GitHub.com/settings`), a host with a port, mixed case, a trailing dot
  or an IDN now yields the bare lowercase hostname the matcher compares against,
  instead of an entry that could never match. Existing lists are repaired once,
  in place, the next time the popup or options page opens.
- Adding a domain the whitelist already covers (`gist.github.com` under
  `github.com`) is reported as "already covered" instead of adding a redundant
  row.
- "Remove current domain" also drops a parent entry that covers the current host,
  so removing `gist.github.com` while `github.com` is whitelisted now stops the
  site being intercepted.
- The popup's add/remove button uses the same host policy as the content
  script, so its state can no longer contradict what the page actually does.
- Importing a whitelist file validates and de-duplicates every entry, reports how
  many were added or skipped, and merges into the existing list instead of
  replacing it — a malformed or partial file can no longer wipe the whitelist.

### [1.7.2] — 2026-10-16

#### Added
- **Visited-link marking** (always on). Links opened through the extension's
  interception are remembered (up to 2000 URLs, stored in
  `chrome.storage.local`) and recolored with the browser's own `VisitedText`
  colour, which follows light / dark mode. Marks update live across tabs,
  apply to dynamically added links, and are removed when the domain leaves
  the whitelist. Fixes #3.

#### Fixed
- Same-document hash-only anchors (`#section`) are no longer patched with
  `target="_blank"`, so in-page navigation stays on the current tab.

### [1.7.1] — 2026-10-01

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

[1.7.2]: https://github.com/shiroixw/OpenInNewTab/releases
[1.7.1]: https://github.com/shiroixw/OpenInNewTab/releases
[1.7.0]: https://github.com/shiroixw/OpenInNewTab/releases
[1.6.0]: https://github.com/shiroixw/OpenInNewTab/releases
[1.4.x]: https://github.com/shiroixw/OpenInNewTab/releases
[1.3.x]: https://github.com/shiroixw/OpenInNewTab/releases

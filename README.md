# Open In New Tab

[English](README.md) | [简体中文](README.zh-CN.md)

A monorepo with two whitelist-based implementations that force links to open
in a new tab. **The Chrome extension is the primary product**; the Tampermonkey
userscript remains available but is not on the same release track.

-   **Chrome Extension**: native popup, options page, and content script
-   **Userscript**: Tampermonkey / Greasemonkey menu + settings modal


## 🎯 How Whitelist Mode Works

The whitelist-based approach means:

1. **By default, NO websites are affected** - The extension/script does nothing until you add domains
2. **You control which sites to modify** - Add specific domains (e.g., github.com, reddit.com) to your whitelist
3. **Links open in new tabs only on whitelisted sites** - Only the websites you add will have their links modified
4. **Easy to manage** - Add or remove domains anytime through the popup interface or menu commands

**Example**: If you add `github.com` to your whitelist, all links on GitHub will open in new tabs. Other websites like Google, Twitter, etc., will remain unchanged unless you also add them to the whitelist.

📖 **[Official Website](https://open-in-new-tab.vercel.app/)** | 🎯 **[Greasy Fork Script](https://greasyfork.org/en/scripts/551033-open-in-new-tab)** | 🌟 **[Star on GitHub](https://github.com/shiroixw/OpenInNewTab)**

## Project Structure

```
/OpenInNewTab/ (Monorepo Root)
├── userscript/              # Tampermonkey userscript version
│   ├── OpenInNewTab.user.js
│   ├── README.md
│   └── LICENSE
├── extension/               # Chrome extension version
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── icons/
│   └── README.md
├── website/                 # Official landing page
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   └── README.md
├── shared/icons/            # Lucide-sourced SVG icons (website + extension)
├── shared/locales/         # i18n single source of truth (ext/us/site × en/zh-CN/zh-TW)
├── shared/i18n.js          # Shared i18n runtime (createI18n)
├── scripts/                 # Repo tooling (version sync, extension zip, i18n sync)
├── README.md                # This file
└── LICENSE                  # MIT License
```

## Quick Start

Choose your preferred version:

### 🚀 Userscript Version

-   **Best for**: Quick testing, development, or users who prefer Tampermonkey
-   **Install from**: [Greasy Fork](https://greasyfork.org/en/scripts/551033-open-in-new-tab) | [See userscript/README.md](userscript/README.md#installation) ([中文](userscript/README.zh-CN.md#安装))
-   **Features**: Menu-based management, dark mode, internationalization

### 🌐 Chrome Extension Version

-   **Best for**: Production use, better performance, native browser integration
-   **Installation**: [See extension/README.md](extension/README.md#installation) ([中文](extension/README.zh-CN.md#安装))
-   **Features**: Popup interface, auto-updates, Web Store distribution

## Documentation

For detailed documentation, please refer to the specific version you want to use:

-   **[Userscript Version](userscript/README.md)** ([中文](userscript/README.zh-CN.md)) - Complete Tampermonkey/Greasemonkey documentation
-   **[Chrome Extension Version](extension/README.md)** ([中文](extension/README.zh-CN.md)) - Complete Chrome extension documentation

Both versions share the same core functionality and features, but have different installation and usage instructions.

## Versioning

The extension and the userscript are **independent products on independent
SemVer tracks**. They must not be kept in lockstep, and a change to one does
**not** require a version bump on the other. Active development focuses on the
extension.

| Product | Version source | Bump command |
| --- | --- | --- |
| Chrome extension | `extension/manifest.json`; the website's `<meta name="app-version" />` tags mirror it | `npm run version:bump:ext` |
| Tampermonkey userscript | `userscript/OpenInNewTab.user.js` — both the `// @version` metadata line and the `SCRIPT_VERSION` constant must agree | `npm run version:bump:us` |

- `npm run version:verify` — fails if (a) the website meta tags disagree with the manifest, or (b) the userscript's two version locations disagree with each other. The two products are **not** compared against each other.
- Do not bump a product's version unless that product is being released.

**Git hook**: pre-commit runs `version:verify` whenever `extension/`, `userscript/`, or `website/` files are staged, and runs `npm run pack:extension` whenever `extension/` files are staged. The hook no longer auto-bumps — set major / minor / patch manually in the relevant file or run the appropriate `version:bump:*` command, then commit.

See [`CHANGELOG.md`](./CHANGELOG.md) for release notes (split per product).

To skip hooks (e.g. `git commit --amend`), use `HUSKY=0 git commit` on Unix shells, or disable Husky for that command per your environment.

## License

MIT License - see LICENSE file for details

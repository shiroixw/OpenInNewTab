# Chrome Web Store screenshots

1280×800 full-bleed PNG candidates for the [listing](https://chromewebstore.google.com/detail/dncofijfkmdpjpidepjjicpmojdecgoo). They are captured from the real extension pages with Chrome DevTools Protocol. The store downscales screenshots to 640×400, so the pages are framed and scaled for readability.

## Files

| File | Contents |
| --- | --- |
| `screenshots/popup-light-add.png` | Real popup, light mode, current domain can be added |
| `screenshots/popup-dark-remove.png` | Real popup, dark mode, current domain is enabled |
| `screenshots/popup-zh-light-add.png` | Real popup, Simplified Chinese (zh-CN), light mode |
| `screenshots/popup-zh-tw-light-add.png` | Real popup, Traditional Chinese (zh-TW), light mode |
| `screenshots/options-light.png` | Real options page, light mode |
| `screenshots/options-dark.png` | Real options page, dark mode |
| `screenshots/options-zh-light.png` | Real options page, Simplified Chinese (zh-CN), light mode |
| `screenshots/options-zh-tw-light.png` | Real options page, Traditional Chinese (zh-TW), light mode |

The screenshots use the current extension HTML, CSS, JavaScript, storage schema,
and localization strings. No marketing-only mock UI is used.

> **Promo tiles** (small 440×280 and marquee 1400×560) are separate marketing
> art, not captures. See [`promo/README.md`](./promo/README.md) for the files,
> the committed templates in `_mock/`, and the render command.
>
> **Composed screenshots** (1280×800, one set per store language slot) are
> brand stages built around the same real extension UI. See
> [`screenshots/marketing/README.md`](./screenshots/marketing/README.md);
> regenerate them with `npm run store:shots`.

## Regenerate

```bash
npm run store:screenshots
```

Requires Chrome for Testing or a compatible Chromium build. Set `CHROME_PATH` to
override the browser path. The script uses a temporary profile and does not
modify the extension's stored data.

Popup shots simulate an **upgrade** so the v1.8.0 update-notes footer is
visible: a fresh install seeds `dismissedUpdateNotice` with the running version
(see `extension/background.js`), which would hide the line. The capture script
sets that key to a prior version and leaves `updateNoticeEnabled` on, then
asserts the footer text before writing each popup PNG. Options shots are framed
at zoom `0.72` so `Settings → Updates` and the footer `Release notes` link both
fit the 1280×800 canvas.

After regenerating, re-crop the website gallery (860×800, `x: 210–1070`):

```bash
python3 - <<'PY'
from pathlib import Path
from PIL import Image
store, site = Path("store/screenshots"), Path("website/screenshots")
for src, dst in [
    ("popup-light-add.png", "popup-light.png"),
    ("popup-dark-remove.png", "popup-dark.png"),
    ("options-light.png", "settings-light.png"),
]:
    Image.open(store / src).crop((210, 0, 1070, 800)).convert("RGB").save(
        site / dst, format="PNG"
    )
PY
```

## Upload

This repo cannot publish to the Chrome Web Store. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole):

1. Open the item → **Store listing** → **Graphics**.
2. Preview the four candidates and choose up to five that best represent the listing.
3. Replace the existing screenshots with the selected PNGs.
4. Submit the listing for review (screenshot-only changes still go through review).

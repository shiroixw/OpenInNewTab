# Privacy Policy for Open In New Tab

Last updated: 2026-08-24

## Data Collection
Open In New Tab does not collect, store, or transmit any personal data to external servers.

## Chrome Sync Storage
The extension uses Chrome sync storage (`chrome.storage.sync`) to save these five fields:
- `userWhitelist` — your whitelist of domain names
- `openInBackground` — whether new tabs open in the background
- `userTheme` — your theme preference (light, dark, or auto)
- `userLanguage` — your language preference
- `updateNoticeEnabled` — whether to show update notices after extension updates

This data stays in Chrome's storage. When you are signed in to Chrome, Chrome may synchronize it across your signed-in browsers; this is handled by Chrome, not by any external service the extension controls. We do not have access to this data.

## Permissions
- **storage**: Used to save the five fields listed above via `chrome.storage.sync`
- **activeTab**: Used to read the current tab's domain for the quick-add feature in the popup
- **host_permissions** (`*://*/*`): Covers the manifest's matching web URLs. The static content scripts (`link-policy.js` and `content.js`) load on pages matching this pattern. Link changes and click interception occur only on domains in your whitelist; on other matching sites the scripts do not modify links or intercept clicks

## Third-Party Services
This extension does not use any third-party services, analytics, or tracking tools.

## Changes to This Policy
We may update this privacy policy from time to time. Changes will be posted on this page.

## Contact
For questions about this privacy policy, please visit: https://github.com/shiroixw/OpenInNewTab/issues

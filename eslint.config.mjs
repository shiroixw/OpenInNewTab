import js from "@eslint/js"
import globals from "globals"

/**
 * Flat ESLint config. Each surface gets only the globals it actually runs with,
 * so undefined-variable checks stay meaningful across the monorepo.
 */
export default [
    { ignores: ["node_modules/**", "release/**", "**/*.min.js"] },
    js.configs.recommended,
    {
        rules: {
            "no-unused-vars": ["error", { caughtErrors: "none" }],
        },
    },
    {
        files: ["extension/**/*.js"],
        ignores: ["extension/content.js", "extension/link-policy.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser, ...globals.webextensions },
        },
    },
    {
        // content.js is injected as a classic script; parsing it as "script"
        // turns any stray static import/export into a lint error instead of a
        // runtime "Cannot use import statement outside a module".
        files: ["extension/content.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser, ...globals.webextensions },
        },
    },
    {
        files: ["extension/link-policy.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.browser, ...globals.webextensions },
        },
    },
    {
        // shared/i18n.js is a classic-script runtime concatenated into the
        // extension and website bundles; it runs in a browser context.
        files: ["shared/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser },
        },
    },
    {
        files: ["userscript/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser, ...globals.greasemonkey },
        },
    },
    {
        files: ["website/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser },
        },
    },
    {
        // `translations` and `i18n` are exposed by the generated website/i18n.js
        // (window.translations + window.i18n) and consumed by script.js.
        files: ["website/script.js"],
        languageOptions: {
            globals: { translations: "readonly", i18n: "readonly" },
        },
    },
    {
        // store/_mock/*.js are the classic scripts behind the mock HTML used to
        // render store graphics. They run in a browser page, not in Node.
        files: ["store/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: { ...globals.browser },
        },
    },
    {
        files: ["**/*.mjs"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: { ...globals.node },
        },
    },
]

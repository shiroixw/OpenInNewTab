/**
 * Open In New Tab — composed store screenshots: scene renderer.
 *
 * The extension panels below are the *real* markup from `extension/popup.html`
 * and `extension/options.html`, styled by the *real* `popup.css` /
 * `options.css`. Only the data (domain list, current domain, locale) is
 * injected here — exactly what `popup.js` / `options.js` would render.
 *
 * Strings are copied from `shared/locales/ext/{en,zh-CN}.json` (the i18n single
 * source of truth). When a string changes there, change it here too.
 *
 * Usage: a scene page declares `data-scene="01-hero"` on <body> and selects the
 * locale through the URL hash: `shot-01-hero.html#zh-CN` / `...#en`.
 */

(function () {
	"use strict";

	/* ------------------------------------------------------------ Lucide icons
	   Verbatim from shared/icons/ (stroke="currentColor", 24×24, width 2). */

	const ICON = {
		settings:
			'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
		x: '<path d="M18 6 6 18M6 6l12 12"/>',
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
		moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
		monitor:
			'<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>',
		chevronRight: '<path d="m9 18 6-6-6-6"/>',
		circleHelp:
			'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
		externalLink:
			'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
		lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	};

	function svg(paths, className) {
		return (
			`<svg class="${className || "icon"}" viewBox="0 0 24 24" fill="none"` +
			' stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
			` stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
		);
	}

	/* ------------------------------------------------------------ extension strings
	   MIRROR: shared/locales/ext/{en,zh-CN}.json */

	const EXT = {
		"zh-CN": {
			modalTitle: "白名单管理",
			currentDomainLabel: "当前域名：",
			quickAddBtnText: "添加",
			whitelistTitle: "白名单",
			removeButton: "移除",
			settingsTitle: "设置",
			themeLabel: "主题",
			themeLightText: "亮色",
			themeDarkText: "暗色",
			themeAutoText: "自动",
			languageLabel: "语言",
			openInBackgroundLabel: "在后台打开新标签",
			openInBackgroundDesc: "打开链接时不切换焦点，留在当前页",
			moreSettings: "更多设置",
			optionsTitle: "扩展设置",
			optionsSubtitle: "配置您的偏好设置和管理白名单",
			appearanceHeading: "外观和语言",
			themeDesc: "选择您的偏好主题",
			languageDesc: "选择您的语言",
			linkBehaviorHeading: "链接行为",
			whitelistHeading: "白名单管理",
			importExportLabel: "导入 / 导出",
			importExportDesc: "备份或恢复您的白名单",
			exportBtnText: "导出",
			importBtnText: "导入",
			addDomainLabel: "添加域名",
			addDomainDesc: "添加一个新域名到白名单",
			addBtnText: "添加",
			inputPlaceholder: "example.com",
			footerText: "Open In New Tab 扩展 v1.7.0",
			domainsCount: (n) => `${n} 个域名`,
			languageOption: "简体中文",
			newTabBadge: "新标签页",
		},
		en: {
			modalTitle: "Whitelist Management",
			currentDomainLabel: "Current Domain:",
			quickAddBtnText: "Add",
			whitelistTitle: "Whitelist",
			removeButton: "Remove",
			settingsTitle: "Settings",
			themeLabel: "Theme",
			themeLightText: "Light",
			themeDarkText: "Dark",
			themeAutoText: "Auto",
			languageLabel: "Language",
			openInBackgroundLabel: "Open in background",
			openInBackgroundDesc: "Keep focus on the current tab when opening links",
			moreSettings: "More settings",
			optionsTitle: "Extension Settings",
			optionsSubtitle: "Configure your preferences and manage whitelist",
			appearanceHeading: "Appearance & Language",
			themeDesc: "Choose your preferred theme",
			languageDesc: "Select your language",
			linkBehaviorHeading: "Link behavior",
			whitelistHeading: "Whitelist Management",
			importExportLabel: "Import / Export",
			importExportDesc: "Backup or restore your whitelist",
			exportBtnText: "Export",
			importBtnText: "Import",
			addDomainLabel: "Add Domain",
			addDomainDesc: "Add a new domain to whitelist",
			addBtnText: "Add",
			inputPlaceholder: "example.com",
			footerText: "Open In New Tab Extension v1.7.0",
			domainsCount: (n) => `${n} domains`,
			languageOption: "English",
			newTabBadge: "New tab",
		},
	};

	const DOMAINS = ["github.com", "youtube.com", "wikipedia.org", "stackoverflow.com"];
	const CURRENT_DOMAIN = "github.com";

	/* ------------------------------------------------------------ extension panels */

	function domainRows(s) {
		return DOMAINS.map(
			(domain) =>
				'<div class="domain-item">' +
				`<span class="domain-name">${domain}</span>` +
				`<button class="remove-btn">${s.removeButton}</button>` +
				"</div>"
		).join("");
	}

	/** extension/popup.html */
	function popupPanel(lang, options) {
		const s = EXT[lang];
		const opts = options || {};
		const spotlight = opts.spotlight ? " is-spotlight" : "";

		return (
			'<div class="container">' +
			'<header class="header">' +
			`<h1>${s.modalTitle}</h1>` +
			'<div class="header-buttons">' +
			`<button class="settings-btn" title="${s.settingsTitle}">${svg(ICON.settings)}</button>` +
			"</div>" +
			"</header>" +
			'<main class="main-content">' +
			'<div class="quick-add-section">' +
			`<div class="current-domain-card${spotlight}">` +
			'<div class="domain-info">' +
			`<span class="domain-label">${s.currentDomainLabel}</span>` +
			`<span class="domain-value">${CURRENT_DOMAIN}</span>` +
			"</div>" +
			`<button class="quick-add-btn"><span>${s.quickAddBtnText}</span></button>` +
			"</div>" +
			"</div>" +
			'<div class="domains-section">' +
			`<div class="section-title">${s.whitelistTitle}</div>` +
			`<div class="domains-list">${domainRows(s)}</div>` +
			"</div>" +
			"</main>" +
			"</div>" +
			(opts.modal ? settingsModal(lang) : "")
		);
	}

	/** extension/popup.html → #settingsModal */
	function settingsModal(lang) {
		const s = EXT[lang];
		const themes = [
			["light", s.themeLightText, ICON.sun],
			["dark", s.themeDarkText, ICON.moon],
			["auto", s.themeAutoText, ICON.monitor],
		];
		const options = ["English", "简体中文", "繁體中文"];

		return (
			'<div class="modal show"><div class="modal-content">' +
			'<div class="modal-header">' +
			`<h2>${s.settingsTitle}</h2>` +
			`<button class="modal-close-btn" aria-label="${s.settingsTitle}">${svg(ICON.x)}</button>` +
			"</div>" +
			'<div class="modal-body">' +
			'<div class="setting-item">' +
			`<label class="setting-label">${s.themeLabel}</label>` +
			'<div class="theme-toggle-group">' +
			themes
				.map(
					([value, text, icon]) =>
						`<button class="theme-option${value === "dark" ? " active" : ""}" data-theme="${value}">` +
						svg(icon, "icon theme-icon") +
						`<span class="theme-text">${text}</span>` +
						"</button>"
				)
				.join("") +
			"</div>" +
			"</div>" +
			'<div class="setting-item">' +
			`<label class="setting-label">${s.languageLabel}</label>` +
			'<select class="language-select">' +
			options
				.map(
					(option) =>
						`<option${option === s.languageOption ? " selected" : ""}>${option}</option>`
				)
				.join("") +
			"</select>" +
			"</div>" +
			'<div class="setting-item setting-item-row">' +
			'<div class="setting-copy">' +
			`<span class="setting-label setting-label-inline">${s.openInBackgroundLabel}</span>` +
			`<span class="setting-hint">${svg(ICON.circleHelp)}` +
			`<span class="setting-hint-tooltip">${s.openInBackgroundDesc}</span></span>` +
			"</div>" +
			'<label class="toggle-switch"><input type="checkbox" checked />' +
			'<span class="toggle-slider" aria-hidden="true"></span></label>' +
			"</div>" +
			`<button class="more-options-row"><span>${s.moreSettings}</span>${svg(ICON.chevronRight)}</button>` +
			"</div></div></div>"
		);
	}

	/** extension/options.html */
	function optionsPanel(lang) {
		const s = EXT[lang];
		const themes = [
			["light", s.themeLightText, ICON.sun],
			["dark", s.themeDarkText, ICON.moon],
			["auto", s.themeAutoText, ICON.monitor],
		];

		return (
			'<div class="options-container">' +
			'<header class="options-header"><div class="header-content">' +
			`<h1>${s.optionsTitle}</h1>` +
			`<p class="subtitle">${s.optionsSubtitle}</p>` +
			"</div></header>" +
			'<main class="options-main">' +
			/* Appearance & language */
			'<section class="settings-section">' +
			`<h2 class="section-heading">${s.appearanceHeading}</h2>` +
			'<div class="settings-card">' +
			'<div class="setting-row">' +
			'<div class="setting-info">' +
			`<label class="setting-title">${s.themeLabel}</label>` +
			`<span class="setting-description">${s.themeDesc}</span>` +
			"</div>" +
			'<div class="theme-toggle-group">' +
			themes
				.map(
					([value, text, icon]) =>
						`<button class="theme-option${value === "light" ? " active" : ""}" data-theme="${value}">` +
						svg(icon, "icon theme-icon") +
						`<span class="theme-text">${text}</span>` +
						"</button>"
				)
				.join("") +
			"</div>" +
			"</div>" +
			'<hr class="divider" />' +
			'<div class="setting-row">' +
			'<div class="setting-info">' +
			`<label class="setting-title">${s.languageLabel}</label>` +
			`<span class="setting-description">${s.languageDesc}</span>` +
			"</div>" +
			'<select class="language-select">' +
			["English", "简体中文", "繁體中文"]
				.map(
					(option) =>
						`<option${option === s.languageOption ? " selected" : ""}>${option}</option>`
				)
				.join("") +
			"</select>" +
			"</div>" +
			"</div>" +
			"</section>" +
			/* Link behaviour */
			'<section class="settings-section">' +
			`<h2 class="section-heading">${s.linkBehaviorHeading}</h2>` +
			'<div class="settings-card">' +
			'<div class="setting-row">' +
			'<div class="setting-info">' +
			`<label class="setting-title">${s.openInBackgroundLabel}</label>` +
			`<span class="setting-description">${s.openInBackgroundDesc}</span>` +
			"</div>" +
			'<label class="toggle-switch"><input type="checkbox" checked />' +
			'<span class="toggle-slider" aria-hidden="true"></span></label>' +
			"</div>" +
			"</div>" +
			"</section>" +
			/* Whitelist management */
			'<section class="settings-section">' +
			`<h2 class="section-heading">${s.whitelistHeading}</h2>` +
			'<div class="settings-card">' +
			'<div class="setting-row">' +
			'<div class="setting-info">' +
			`<label class="setting-title">${s.importExportLabel}</label>` +
			`<span class="setting-description">${s.importExportDesc}</span>` +
			"</div>" +
			'<div class="button-group">' +
			`<button class="action-btn">${s.exportBtnText}</button>` +
			`<button class="action-btn">${s.importBtnText}</button>` +
			"</div>" +
			"</div>" +
			'<hr class="divider" />' +
			'<div class="setting-row">' +
			'<div class="setting-info">' +
			`<label class="setting-title">${s.addDomainLabel}</label>` +
			`<span class="setting-description">${s.addDomainDesc}</span>` +
			"</div>" +
			'<div class="input-with-button">' +
			`<input type="text" placeholder="${s.inputPlaceholder}" />` +
			`<button class="add-btn">${s.addBtnText}</button>` +
			"</div>" +
			"</div>" +
			'<hr class="divider" />' +
			'<div class="domains-container">' +
			'<div class="domains-header">' +
			`<span class="domains-count">${s.domainsCount(DOMAINS.length)}</span>` +
			"</div>" +
			`<div class="domains-list">${domainRows(s)}</div>` +
			"</div>" +
			"</div>" +
			"</section>" +
			"</main>" +
			`<footer class="options-footer"><div class="footer-content">${s.footerText}</div></footer>` +
			"</div>"
		);
	}

	/* ------------------------------------------------------------ browser window mock
	   The only non-extension UI in these screenshots: a neutral Chromium-shaped
	   frame that gives the popup context. */

	function browserWindow(lang, box) {
		const s = EXT[lang];
		const rows = [
			{ text: "Show HN: I built a link opener" },
			{ text: "github.com/shiroxw/OpenInNewTab", hit: true },
			{ text: "Ask HN: how do you manage 100 tabs?" },
			{ text: "Web browser — Wikipedia" },
		];

		return (
			`<div class="window" style="left:${box.left}px;top:${box.top}px;` +
			`width:${box.width}px;height:${box.height}px">` +
			'<div class="tabbar">' +
			'<div class="tab">news.ycombinator.com</div>' +
			`<div class="tab tab--active">github.com<span class="tab-badge">${s.newTabBadge}</span></div>` +
			"</div>" +
			'<div class="toolbar">' +
			`<div class="address">${svg(ICON.lock)}github.com</div>` +
			'<div class="ext-btn"><img src="icon128.png" alt="" /></div>' +
			"</div>" +
			'<div class="page">' +
			rows
				.map(
					(row) =>
						`<div class="link-row${row.hit ? " link-row--hit" : ""}">` +
						'<span class="dot"></span>' +
						`<span class="text">${row.text}</span>` +
						(row.hit ? svg(ICON.externalLink, "hit-icon") : "") +
						"</div>"
				)
				.join("") +
			"</div>" +
			"</div>"
		);
	}

	/* ------------------------------------------------------------ scenes */

	const SCENES = {
		"01-hero": {
			theme: "light",
			caption: {
				"zh-CN": {
					eyebrow: "Chrome 扩展",
					title: '让每个链接<br /><span class="accent">在新标签页打开</span>',
					desc: "白名单模式 —— 默认不改动任何网站，只作用于你加入的域名。",
				},
				en: {
					eyebrow: "Chrome Extension",
					title: 'Every link opens<br /><span class="accent">in a new tab</span>',
					desc: "Whitelist mode — nothing changes by default; only the domains you add are affected.",
				},
			},
			visuals(lang) {
				return (
					browserWindow(lang, { left: 0, top: 70, width: 540, height: 380 }) +
					'<div class="panel panel--popup" style="right:0;top:110px">' +
					popupPanel(lang) +
					"</div>"
				);
			},
		},

		"02-add": {
			theme: "light",
			caption: {
				"zh-CN": {
					eyebrow: "一键添加",
					title: '把当前网站<br /><span class="accent">加入白名单</span>',
					desc: "不用手输域名，打开网站点一下就好。",
					steps: [
						{ t: "点击工具栏的扩展图标", d: "弹出面板，自动识别当前域名" },
						{ t: "点「添加」", d: "该网站的链接立刻改为在新标签页打开" },
					],
				},
				en: {
					eyebrow: "One click",
					title: 'Whitelist the site<br /><span class="accent">you are on</span>',
					desc: "No typing domains — open a site and click once.",
					steps: [
						{ t: "Click the toolbar icon", d: "The popup detects the current domain" },
						{ t: "Press Add", d: "Links on that site open in new tabs from now on" },
					],
				},
			},
			visuals(lang) {
				return (
					'<div class="panel panel--popup" style="right:0;top:61px">' +
					popupPanel(lang, { spotlight: true }) +
					"</div>"
				);
			},
		},

		"03-whitelist": {
			theme: "light",
			captionStyle: "flex:0 0 320px",
			caption: {
				"zh-CN": {
					eyebrow: "完整设置页",
					title: '白名单<br /><span class="accent">集中管理</span>',
					desc: "添加、移除、导入导出，以及主题与语言设置，都在一个页面里。",
				},
				en: {
					eyebrow: "Full options page",
					title: 'Manage your<br /><span class="accent">whitelist</span>',
					desc: "Add, remove, import and export — plus theme and language, all in one page.",
				},
			},
			// The options page is ~1015px tall at 800px wide, so the panel is sized
			// to the whitelist section and scrolled to it — that is what this scene
			// is about. Sizing is measured at runtime so both locales fit.
			scroll: {
				panel: ".panel--options",
				target: ".settings-section:last-of-type",
				offset: 16,
				fit: true,
			},
			visuals(lang) {
				return (
					'<div class="panel panel--options" style="left:0">' +
					optionsPanel(lang) +
					"</div>"
				);
			},
		},

		"04-settings": {
			theme: "dark",
			caption: {
				"zh-CN": {
					eyebrow: "设置",
					title: '明暗主题<br /><span class="accent">与多语言</span>',
					desc: "跟随系统或手动切换，支持简体中文、繁體中文与 English。",
				},
				en: {
					eyebrow: "Settings",
					title: 'Light, dark<br /><span class="accent">and 3 languages</span>',
					desc: "Follow the system or pick manually — English, 简体中文 and 繁體中文.",
				},
			},
			visuals(lang) {
				return (
					'<div class="panel panel--popup" style="right:0;top:61px">' +
					popupPanel(lang, { modal: true }) +
					"</div>"
				);
			},
		},
	};

	/* ------------------------------------------------------------ bootstrap */

	const sceneId = document.body.dataset.scene;
	const scene = SCENES[sceneId];
	if (!scene) {
		throw new Error(`shot-parts: unknown scene "${sceneId}"`);
	}

	const lang = (window.location.hash || "#zh-CN").slice(1);
	if (!EXT[lang]) {
		throw new Error(`shot-parts: unknown locale "${lang}"`);
	}

	const cap = scene.caption[lang];
	document.body.style.colorScheme = scene.theme;

	document.querySelector(".stage").innerHTML =
		`<section class="caption"${scene.captionStyle ? ` style="${scene.captionStyle}"` : ""}>` +
		`<span class="eyebrow">${cap.eyebrow}</span>` +
		`<h1>${cap.title}</h1>` +
		`<p class="desc">${cap.desc}</p>` +
		(cap.steps
			? '<ul class="steps">' +
				cap.steps
					.map(
						(step, index) =>
							'<li class="step">' +
							`<span class="num">${index + 1}</span>` +
							`<span class="txt">${step.t}<small>${step.d}</small></span>` +
							"</li>"
					)
					.join("") +
				"</ul>"
			: "") +
		"</section>" +
		`<section class="visuals">${scene.visuals(lang)}</section>`;

	if (scene.scroll) {
		const scroller = document.querySelector(scene.scroll.panel);
		const target = scroller.querySelector(scene.scroll.target);
		const top = target.offsetTop - scene.scroll.offset;
		if (scene.scroll.fit) {
			scroller.style.height = `${scroller.scrollHeight - top}px`;
		}
		scroller.scrollTop = top;
	}
})();

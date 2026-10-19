window.__ModuleLoader__.load({ id: "dsh-sidebar-fold", factory: (require) => {
	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	var react = require("react");
	// 只依赖 React.createElement：jsx-runtime 在某些打包形态下拿不到，
	// 而 createElement 一定在。h(type, props, ...children) 与 jsx 的调用形状一致。
	var h = react.createElement;

	var PANEL_ID = "dsh-sidebar-fold";
	var GLYPH_CLASS = "dsh-fold-glyph";
	var STORAGE_KEY = "dsh-sidebar-fold:expanded";
	// 折叠用「标记属性 + !important 样式」，而不是直接写 inline style.display。
	// 原因：docker / rss / tty / search / agnes 这些插件各自都挂了 MutationObserver
	// 盯自己那一行的 style，直接改 display 会把它们反复唤醒，来回打架。
	// 换成一个我们自己独有的属性名，谁也观察不到，也就不可能有回环。
	var HIDDEN_ATTR = "data-dsh-fold-hidden";

	// 折叠态：true = 侧边栏里展开所有面板行；false = 只留「插件大全」一行。
	var expanded = readExpanded();
	var listeners = [];

	function readExpanded() {
		try {
			return window.localStorage.getItem(STORAGE_KEY) === "1";
		} catch (_) {
			return false;
		}
	}

	function writeExpanded(value) {
		try {
			window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
		} catch (_) {
			/* ignore */
		}
	}

	function subscribe(fn) {
		listeners.push(fn);
		return function () {
			var i = listeners.indexOf(fn);
			if (i >= 0) listeners.splice(i, 1);
		};
	}

	function emit() {
		for (var i = 0; i < listeners.length; i++) {
			try {
				listeners[i](expanded);
			} catch (_) {
				/* ignore */
			}
		}
	}

	function setExpanded(value) {
		if (expanded === value) return;
		expanded = value;
		writeExpanded(value);
		applyVisibility();
		emit();
	}

	// ------------------------------------------------------------------
	// DOM 读取层
	//
	// 设计要点：不读 slot 注册表，直接读侧边栏真实渲染出来的 DOM。
	// 原因是宿主 SidebarRoot 只会把 sidebar.panellist 的条目渲染成
	// <nav> 里的一排 <button aria-label>，而 slot 注册表的快照时机
	// 取决于各插件何时完成注册（有的插件晚到几百毫秒），快照会漏条目。
	// 读 DOM 则天然"所见即所得"：侧边栏显示几行，这里就拿到几行。
	// ------------------------------------------------------------------

	/**
	 * 拿到包住「插件大全」那一行的 nav；没有则返回 null。
	 *
	 * 注意：主面板里的图标是克隆出来的，可能残留同名 class，
	 * 所以这里要遍历所有匹配项，取第一个「真的在 nav 里」的，
	 * 不能只取 querySelector 的第一个。
	 */
	function sideNav() {
		var all = document.querySelectorAll("." + GLYPH_CLASS);
		for (var i = 0; i < all.length; i++) {
			var el = all[i];
			var nav = el && el.closest ? el.closest("nav") : null;
			if (nav) return nav;
		}
		return null;
	}

	// ------------------------------------------------------------------
	// 侧边栏里其实有两类「面板行」。
	//
	// 第一类走 slot：sidebar.panellist → 宿主渲染成 <nav> 里的一排 <button>。
	// 第二类根本不经 slot：插件自己造一个 <div>/<button>，直接插进侧边栏内部
	// 容器（就是 logoRow 的父节点），排在 nav 前面。这类行既不在 slot 注册表里、
	// 也不是 nav 的孩子，所以只折叠 nav 的孩子永远折不到它们。
	//
	// 现存实例（逐个读源码确认过 dataset 属性名）：
	//   泡泡猫的影视工具  dataset.dshAgnesStudioEntry   → button.agnes-entry
	//   今日值得读        data-dsh-rss-entry
	//   全局搜索…         data-dsh-global-search-entry
	//   终端              data-dsh-tty-entry
	//   容器              data-dsh-docker-entry
	// 统一特征是 dataset 里有一个 /^dsh.*Entry$/ 的键。按特征识别而不是按
	// 插件名写死：将来再有插件照同样约定插进来，也能自动被收进「插件大全」。
	// ------------------------------------------------------------------

	function isInjectedEntry(el) {
		if (!el || el.nodeType !== 1 || !el.dataset) return false;
		var keys = Object.keys(el.dataset);
		for (var i = 0; i < keys.length; i++) {
			if (/^dsh/i.test(keys[i]) && /Entry$/.test(keys[i])) return true;
		}
		return false;
	}

	/** 侧边栏内部容器：logoRow 的父节点（与各插件插入入口时的取法保持一致）。 */
	function sidebarRoot() {
		var column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
		if (!column) return null;
		var logoRow = column.querySelector('[class*="logoRow"]');
		if (logoRow && logoRow.parentElement) return logoRow.parentElement;
		return column.firstElementChild || null;
	}

	/** 插件直接插进侧边栏的入口行，按 DOM 顺序。 */
	function injectedEntries() {
		var root = sidebarRoot();
		if (!root) return [];
		var out = [];
		var children = root.children;
		for (var i = 0; i < children.length; i++) {
			if (isInjectedEntry(children[i])) out.push(children[i]);
		}
		return out;
	}

	function rowOf(wrap, injected) {
		if (!wrap || wrap.nodeType !== 1) return null;
		var btn = null;
		if (wrap.tagName === "BUTTON") {
			btn = wrap;
		} else if (wrap.querySelector) {
			btn = wrap.querySelector("button");
		}
		// 插件自插的入口有 <div role="button"> 形态，本身可点，没有内层 button。
		if (!btn && injected) btn = wrap;
		if (!btn) return null;
		var label = btn.getAttribute("aria-label") || wrap.getAttribute("aria-label");
		if (!label) {
			label = (btn.textContent || "").replace(/\s+/g, " ").trim();
		}
		var glyphEl = null;
		try {
			glyphEl =
				wrap.querySelector("svg") ||
				wrap.querySelector('[aria-hidden="true"]') ||
				wrap.querySelector("img") ||
				wrap.firstElementChild;
		} catch (_) {
			glyphEl = null;
		}
		return {
			btn: btn,
			wrap: wrap,
			label: label || "未命名面板",
			glyphEl: glyphEl,
			injected: !!injected,
			self: !!(wrap.querySelector && wrap.querySelector("." + GLYPH_CLASS))
		};
	}

	/** nav 里由 slot 渲染出来的面板行，按 DOM 顺序。 */
	function navRows() {
		var nav = sideNav();
		if (!nav) return [];
		var out = [];
		var children = nav.children;
		for (var i = 0; i < children.length; i++) {
			var row = rowOf(children[i], false);
			if (row) out.push(row);
		}
		return out;
	}

	/** 「插件大全」列出的全部行：插件自插的入口在前，nav 里的 slot 行在后。 */
	function allRows() {
		var out = [];
		var injected = injectedEntries();
		for (var i = 0; i < injected.length; i++) {
			var row = rowOf(injected[i], true);
			if (row) out.push(row);
		}
		var rows = navRows();
		for (var j = 0; j < rows.length; j++) out.push(rows[j]);
		return out;
	}

	// 写之前先比对当前值：避免自身写入触发 MutationObserver 造成死循环。
	function setHidden(el, hidden) {
		if (!el || !el.hasAttribute) return;
		var has = el.hasAttribute(HIDDEN_ATTR);
		if (hidden && !has) el.setAttribute(HIDDEN_ATTR, "");
		else if (!hidden && has) el.removeAttribute(HIDDEN_ATTR);
	}

	// 兼容老版本写在 inline style 上的折叠状态，重装时一并清掉。
	function clearLegacyDisplay(el) {
		if (el && el.style && el.style.display === "none") el.style.display = "";
	}

	// 把除「插件大全」以外的行收起或展开（两类行一起处理）。
	function applyVisibility() {
		var rows = navRows();
		for (var i = 0; i < rows.length; i++) {
			setHidden(rows[i].wrap, !rows[i].self && !expanded);
		}
		var injected = injectedEntries();
		for (var k = 0; k < injected.length; k++) {
			setHidden(injected[k], !expanded);
		}
	}

	// 退场时把所有行恢复显示，避免插件被禁用后侧边栏空一块。
	function restoreRows() {
		var rows = navRows();
		for (var i = 0; i < rows.length; i++) {
			setHidden(rows[i].wrap, false);
			clearLegacyDisplay(rows[i].wrap);
		}
		var injected = injectedEntries();
		for (var k = 0; k < injected.length; k++) {
			setHidden(injected[k], false);
			clearLegacyDisplay(injected[k]);
		}
	}

	function raf(fn) {
		if (typeof window.requestAnimationFrame === "function") {
			return window.requestAnimationFrame(fn);
		}
		return window.setTimeout(fn, 16);
	}

	/**
	 * 持续盯住 DOM：
	 * - childList：面板行增删（插件晚到注册会插入新行）
	 * - attributes/style：React 重渲染可能覆盖我们写的 display，需要重新施加
	 * - attributes/aria-label：语言切换后标签变了，列表要跟着刷新
	 * 用 rAF 合并高频回调，避免每次变动都全量重扫。
	 */
	function watchDom(onChange) {
		var scheduled = 0;
		var run = function () {
			scheduled = 0;
			try {
				applyVisibility();
			} catch (_) {
				/* ignore */
			}
			if (typeof onChange === "function") {
				try {
					onChange();
				} catch (_) {
					/* ignore */
				}
			}
		};
		var schedule = function () {
			if (scheduled) return;
			scheduled = raf(run);
		};
		var observer = new MutationObserver(schedule);
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["style", "aria-label"]
		});
		schedule();
		return function () {
			observer.disconnect();
		};
	}

	function FolderGlyph(props) {
		var size = props.size || 16;
		return h(
			"svg",
			{
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false"
			},
			h("path", {
				d: "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.879a1.5 1.5 0 0 1 1.06.44l.872.87h4.189A1.5 1.5 0 0 1 14 5.81v5.69a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z",
				stroke: "currentColor",
				strokeWidth: "1.3",
				strokeLinejoin: "round"
			})
		);
	}

	function ChevronGlyph(props) {
		var size = props.size || 14;
		return h(
			"svg",
			{
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				focusable: "false"
			},
			h("path", {
				d: props.expanded ? "M4 6.5L8 10.5L12 6.5" : "M4 10.5L8 6.5L12 10.5",
				stroke: "currentColor",
				strokeWidth: "1.4",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		);
	}

	// 把侧边栏那一行的图标原样搬过来：克隆真实 DOM 节点，
	// 这样第三方插件自定义的图标（SVG / 字符 / 图片）都能正确复现。
	function RowIcon(props) {
		var row = props.row;
		var host = react.useRef(null);
		react.useEffect(function () {
			var el = host.current;
			if (!el) return;
			el.textContent = "";
			// 自己那一行直接用组件画：克隆会带进 GLYPH_CLASS，
			// 和侧边栏那一行撞车，进而干扰 sideNav() 的定位。
			if (row && row.self) return;
			var src = row && row.glyphEl;
			if (!src) return;
			try {
				var clone = src.cloneNode(true);
				// 清掉克隆体里所有 GLYPH_CLASS 残留（含嵌套）。
				var dup = clone.querySelectorAll ? clone.querySelectorAll("." + GLYPH_CLASS) : [];
				for (var i = dup.length - 1; i >= 0; i--) {
					if (dup[i].parentNode) dup[i].parentNode.removeChild(dup[i]);
				}
				el.appendChild(clone);
			} catch (_) {
				/* 克隆失败就留空，不影响文字标签 */
			}
		});
		return h(
			"span",
			{ className: "dsh-fold-item-icon", ref: host },
			props.row && props.row.self ? h(FolderGlyph, { size: 16 }) : null
		);
	}

	function apply(ctx) {
		var slots;
		try {
			slots = ctx.get("slots");
		} catch (_) {
			slots = undefined;
		}
		if (!slots || typeof slots.register !== "function") {
			console.warn("[dsh-sidebar-fold] host has no slots service — panel folding disabled");
			return;
		}

		var layout;
		try {
			layout = ctx.get("layout");
		} catch (_) {
			/* layout 不可用时退化成纯折叠 */
		}

		try {
			installFoldStyles();
		} catch (e) {
			console.warn("[dsh-sidebar-fold] style injection failed:", e && e.message);
		}

		// 面板列表：状态里存的是 DOM 节点引用，靠版本号驱动重渲染。
		// 每次 DOM 变动（新增行 / 改标签）都会重建一次，保证与侧边栏完全一致。
		function useRows() {
			var store = react.useState({ rows: [], version: 0 });
			var state = store[0];
			var setState = store[1];

			react.useEffect(function () {
				var alive = true;
				var refresh = function () {
					if (!alive) return;
					var next = allRows();
					setState(function (prev) {
						if (prev.rows.length === next.length) {
							var same = true;
							for (var i = 0; i < next.length; i++) {
								if (prev.rows[i].wrap !== next[i].wrap || prev.rows[i].label !== next[i].label) {
									same = false;
									break;
								}
							}
							if (same) return prev;
						}
						return { rows: next, version: (prev.version || 0) + 1 };
					});
				};
				refresh();
				var stop = watchDom(refresh);
				return function () {
					alive = false;
					stop();
				};
			}, []);

			return state.rows;
		}

		function FoldPanel() {
			var rows = useRows();
			var state = react.useState(expanded);
			var isExpanded = state[0];
			var setLocal = state[1];

			react.useEffect(function () {
				return subscribe(function (next) {
					setLocal(next);
				});
			}, []);

			// 「插件大全」自己也占一行，不计入收纳数量。
			var count = 0;
			for (var i = 0; i < rows.length; i++) {
				if (!rows[i].self) count++;
			}

			return h(
				"div",
				{ className: "dsh-fold-panel" },
				h(
					"div",
					{ className: "dsh-fold-headrow" },
					h(
						"div",
						{ className: "dsh-fold-headtitle" },
						h(FolderGlyph, { size: 18 }),
						h("span", null, "插件大全")
					),
					h(
						"button",
						{
							type: "button",
							className: "dsh-fold-toggle",
							onClick: function () {
								setExpanded(!expanded);
							}
						},
						h(ChevronGlyph, { size: 14, expanded: isExpanded }),
						h("span", null, isExpanded ? "折叠侧边栏" : "展开到侧边栏")
					)
				),
				h(
					"div",
					{ className: "dsh-fold-hint" },
					isExpanded
						? "侧边栏正显示全部 " + rows.length + " 行；点右侧按钮可重新折叠成一行。"
						: "已收纳 " + count + " 个面板，全部收在侧边栏这一行里，从下面直接进入。"
				),
				h(
					"div",
					{ className: "dsh-fold-body" },
					rows.length === 0
						? h("div", { className: "dsh-fold-empty" }, "正在读取侧边栏面板…")
						: rows.map(function (row, index) {
								return h(
									"button",
									{
										key: row.label + "#" + index,
										type: "button",
										className: row.self ? "dsh-fold-item is-self" : "dsh-fold-item",
										title: row.label,
										onClick: function () {
											// 直接点真实按钮：无论是布局面板还是插件自己弹的窗口，
											// 行为都与用户在侧边栏上点它完全一致。
											try {
												if (row.self) {
													if (layout && typeof layout.selectPanel === "function") {
														layout.selectPanel(PANEL_ID);
													}
													return;
												}
												row.btn.click();
											} catch (e) {
												console.warn("[dsh-sidebar-fold] click failed:", e && e.message);
											}
										}
									},
									h(RowIcon, { row: row }),
									h("span", { className: "dsh-fold-item-label" }, row.label)
								);
							})
				)
			);
		}

		// 幂等保护：DSH 桌面端会按 dependencies 自动装载插件，profile patch 也可能再装载一次。
		// 同一 id 重复注册会抛错，进而让整个 web-boot 失败——所以先探测再注册。
		var alreadyRegistered = false;
		try {
			var existing = slots.entriesOfSlot("sidebar.panellist") || [];
			for (var ei = 0; ei < existing.length; ei++) {
				var eo = (existing[ei] && existing[ei].options) || {};
				if (eo.id === PANEL_ID) {
					alreadyRegistered = true;
					break;
				}
			}
		} catch (_) {
			/* 探测失败就当未注册 */
		}
		if (alreadyRegistered) {
			console.warn("[dsh-sidebar-fold] already registered, skipping duplicate apply");
			return;
		}

		// 所有注册都裹 try/catch：插件自身出错只应让功能失效，绝不能让整个应用起不来。
		var offPanel;
		try {
			offPanel = slots.register(
				{
					name: "main",
					key: PANEL_ID,
					priority: 0
				},
				function () {
					return h(FoldPanel, null);
				}
			);
		} catch (e) {
			console.warn("[dsh-sidebar-fold] main panel registration failed:", e && e.message);
		}

		// 侧边栏那一行：order 取足够小的值，排在最前面。
		var offRow;
		try {
			offRow = slots.register(
				{
					name: "sidebar.panellist",
					id: PANEL_ID,
					order: -1000,
					label: "插件大全"
				},
				function (owner) {
					return h("span", { className: GLYPH_CLASS }, h(FolderGlyph, { size: (owner && owner.size) || 16 }));
				}
			);
		} catch (e) {
			console.warn("[dsh-sidebar-fold] sidebar row registration failed:", e && e.message);
		}

		var locale;
		try {
			locale = ctx.get("locale");
		} catch (_) {
			/* locale 不可用时只少一层刷新 */
		}

		// 立刻应用一次折叠，并持续盯住 DOM 变化。
		var stopWatch = function () {};
		try {
			applyVisibility();
			stopWatch = watchDom(null);
		} catch (e) {
			console.warn("[dsh-sidebar-fold] fold watcher failed:", e && e.message);
		}

		// 自检：4 秒后把真实折叠规模打到控制台，用来确认插件到底有没有生效。
		// nav 是走 slot 的行数，injected 是插件直接插进侧边栏的行数。
		try {
			setTimeout(function () {
				try {
					console.info(
						"[dsh-sidebar-fold] active: expanded=" +
							expanded +
							" navRows=" +
							navRows().length +
							" injectedRows=" +
							injectedEntries().length +
							" rootFound=" +
							!!sidebarRoot()
					);
				} catch (_) {
					/* ignore */
				}
			}, 4000);
		} catch (_) {
			/* ignore */
		}

		var stopLocale = undefined;
		try {
			if (locale && typeof locale.subscribe === "function") {
				stopLocale = locale.subscribe(function () {
					applyVisibility();
				});
			}
		} catch (_) {
			stopLocale = undefined;
		}

		try {
			ctx.effect(function () {
				return function () {
					try {
						restoreRows();
					} catch (_) {
						/* ignore */
					}
					try {
						if (typeof stopWatch === "function") stopWatch();
					} catch (_) {
						/* ignore */
					}
					if (typeof stopLocale === "function") {
						try {
							stopLocale();
						} catch (_) {
							/* ignore */
						}
					}
					if (typeof offRow === "function") {
						try {
							offRow();
						} catch (_) {
							/* ignore */
						}
					}
					if (typeof offPanel === "function") {
						try {
							offPanel();
						} catch (_) {
							/* ignore */
						}
					}
					try {
						if (layout && layout.panelInfo && layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) {
							layout.selectPanel(null);
						}
					} catch (_) {
						/* ignore */
					}
				};
			});
		} catch (e) {
			console.warn("[dsh-sidebar-fold] effect registration failed:", e && e.message);
		}
	}

	function installFoldStyles() {
		if (document.getElementById("dsh-sidebar-fold-style")) return;
		var style = document.createElement("style");
		style.id = "dsh-sidebar-fold-style";
		style.textContent = [
			"[" + HIDDEN_ATTR + "]{display:none !important}",
			"." + GLYPH_CLASS + "{display:inline-flex;align-items:center;justify-content:center}",
			".dsh-fold-panel{display:flex;flex-direction:column;gap:12px;padding:16px;height:100%;overflow:auto;box-sizing:border-box}",
			".dsh-fold-headrow{display:flex;align-items:center;justify-content:space-between;gap:12px}",
			".dsh-fold-headtitle{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600}",
			".dsh-fold-toggle{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--dsh-border,rgba(128,128,128,.35));border-radius:10px;background:var(--dsh-surface,rgba(128,128,128,.08));color:inherit;font:inherit;cursor:pointer}",
			".dsh-fold-toggle:hover{background:var(--dsh-surface-hover,rgba(128,128,128,.16))}",
			".dsh-fold-hint{opacity:.65;font-size:12px}",
			".dsh-fold-body{display:flex;flex-direction:column;gap:2px}",
			".dsh-fold-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border:none;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}",
			".dsh-fold-item:hover{background:var(--dsh-surface-hover,rgba(128,128,128,.16))}",
			".dsh-fold-item.is-self{opacity:.6}",
			".dsh-fold-item-icon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;opacity:.85;flex:none}",
			".dsh-fold-item-icon svg{width:16px;height:16px}",
			".dsh-fold-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-fold-empty{opacity:.6;padding:8px 4px}"
		].join("\n");
		(document.head || document.documentElement).appendChild(style);
	}

	var inject = ["slots", "layout", "locale"];
	var name = "dsh-sidebar-fold";

	// 最后一道兜底：任何时候插件自身出错都只打日志，绝不让异常冒到 boot 层。
	// 一个可选插件的 bug 不应该让整个应用起不来。
	exports.apply = function (ctx) {
		try {
			apply(ctx);
		} catch (e) {
			console.warn("[dsh-sidebar-fold] apply failed, plugin disabled:", e && e.message);
		}
	};
	exports.inject = inject;
	exports.name = name;
	return module.exports;
	}
});

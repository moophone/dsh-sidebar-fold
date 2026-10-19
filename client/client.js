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
		applyRowVisibility();
		emit();
	}

	// 找到「插件大全」那一行所在的 nav，把其余面板行收起/展开。
	// 不依赖任何编译期 hash 类名，也不依赖 aria-label（会随 locale 变）。
	function applyRowVisibility() {
		var glyph = document.querySelector("." + GLYPH_CLASS);
		if (!glyph) return;
		var nav = glyph.closest ? glyph.closest("nav") : null;
		if (!nav) return;
		var children = nav.children;
		for (var i = 0; i < children.length; i++) {
			var child = children[i];
			if (!child || child.nodeType !== 1) continue;
			var own = child.querySelector ? child.querySelector("." + GLYPH_CLASS) : null;
			child.style.display = own ? "" : expanded ? "" : "none";
		}
	}

	function watchRows() {
		var observer = new MutationObserver(function () {
			applyRowVisibility();
		});
		observer.observe(document.body, { childList: true, subtree: true });
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

	function resolveLabel(label, fallback) {
		if (typeof label === "function") {
			try {
				return label() || fallback;
			} catch (_) {
				return fallback;
			}
		}
		return label || fallback;
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

		installFoldStyles();

		// 订阅 sidebar.panellist，实时拿到所有面板行（含我们自己的那行）。
		function usePanelEntries() {
			var state = react.useState(readEntries);
			var setEntries = state[1];

			react.useEffect(function () {
				var read = function () {
					setEntries(readEntries());
				};
				read();
				var unsubscribe;
				try {
					// subscribe 是条目级订阅：只认条目名，不带 key。
					// 这一点与宿主 ui-sidebar 第 60 行的用法一致。
					unsubscribe = slots.subscribe("sidebar.panellist", read);
				} catch (_) {
					unsubscribe = undefined;
				}
				return function () {
					if (typeof unsubscribe === "function") unsubscribe();
				};
			}, []);

			return state[0];

			function readEntries() {
				var list = [];
				try {
					var raw = slots.entriesOfSlot("sidebar.panellist") || [];
					for (var i = 0; i < raw.length; i++) {
						var item = raw[i];
						var options = (item && item.options) || {};
						if (!options.id) continue;
						list.push({
							id: options.id,
							order: typeof options.order === "number" ? options.order : 0,
							label: resolveLabel(options.label, options.id),
							render: item.render
						});
					}
				} catch (_) {
					/* ignore */
				}
				list.sort(function (a, b) {
					return a.order - b.order;
				});
				return list;
			}
		}

		function FoldPanel() {
			var entries = usePanelEntries();
			var state = react.useState(expanded);
			var isExpanded = state[0];
			var setLocal = state[1];

			react.useEffect(function () {
				return subscribe(function (next) {
					setLocal(next);
				});
			}, []);

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
						h("span", null, isExpanded ? "在侧边栏展开" : "侧边栏已折叠")
					)
				),
				h(
					"div",
					{ className: "dsh-fold-hint" },
					isExpanded
						? "侧边栏正显示全部面板行；点上面按钮可重新折叠成一行。"
						: "所有面板已折叠成侧边栏的一行，从这里直接进入。"
				),
				h(
					"div",
					{ className: "dsh-fold-body" },
					entries.length === 0
						? h("div", { className: "dsh-fold-empty" }, "没有可用的面板")
						: entries.map(function (entry) {
								return h(
									"button",
									{
										key: entry.id,
										type: "button",
										className: entry.id === PANEL_ID ? "dsh-fold-item is-self" : "dsh-fold-item",
										onClick: function () {
											if (layout && typeof layout.selectPanel === "function") {
												try {
													layout.selectPanel(entry.id);
												} catch (_) {
													/* ignore */
												}
											}
										}
									},
									h("span", { className: "dsh-fold-item-icon" }, renderEntryIcon(entry)),
									h("span", { className: "dsh-fold-item-label" }, entry.label)
								);
							})
				)
			);
		}

		function renderEntryIcon(entry) {
			if (typeof entry.render === "function") {
				try {
					var node = entry.render({ size: 16, active: false });
					if (node) return node;
				} catch (_) {
					/* ignore */
				}
			}
			return h(FolderGlyph, { size: 16 });
		}

		// main 面板本体。
		var offPanel = slots.register(
			{
				name: "main",
				key: PANEL_ID,
				priority: 0
			},
			function () {
				return h(FoldPanel, null);
			}
		);

		// 侧边栏那一行：order 取足够小的值，排在最前面。
		var offRow = slots.register(
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

		var locale;
		try {
			locale = ctx.get("locale");
		} catch (_) {
			/* locale 不可用时只少一层刷新 */
		}

		// 立刻应用一次折叠，并持续监听侧边栏结构变化（面板行增删、locale 刷新）。
		applyRowVisibility();
		var stopWatch = watchRows();
		var stopLocale = undefined;
		try {
			if (locale && typeof locale.subscribe === "function") {
				stopLocale = locale.subscribe(function () {
					applyRowVisibility();
				});
			}
		} catch (_) {
			stopLocale = undefined;
		}

		ctx.effect(function () {
			return function () {
				// 退场时先恢复被隐藏的行，避免插件禁用后侧边栏空一块。
				var glyph = document.querySelector("." + GLYPH_CLASS);
				var nav = glyph && glyph.closest ? glyph.closest("nav") : null;
				if (nav) {
					var children = nav.children;
					for (var i = 0; i < children.length; i++) {
						if (children[i] && children[i].nodeType === 1) children[i].style.display = "";
					}
				}
				stopWatch();
				if (typeof stopLocale === "function") stopLocale();
				if (typeof offRow === "function") offRow();
				if (typeof offPanel === "function") offPanel();
				if (layout && layout.panelInfo && layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) {
					try {
						layout.selectPanel(null);
					} catch (_) {
						/* ignore */
					}
				}
			};
		});
	}

	function installFoldStyles() {
		if (document.getElementById("dsh-sidebar-fold-style")) return;
		var style = document.createElement("style");
		style.id = "dsh-sidebar-fold-style";
		style.textContent = [
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
			".dsh-fold-item.is-self{opacity:.6;cursor:default}",
			".dsh-fold-item-icon{display:inline-flex;opacity:.85;flex:none}",
			".dsh-fold-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsh-fold-empty{opacity:.6;padding:8px 4px}"
		].join("\n");
		(document.head || document.documentElement).appendChild(style);
	}

	var inject = ["slots", "layout", "locale"];
	var name = "dsh-sidebar-fold";

	exports.apply = apply;
	exports.inject = inject;
	exports.name = name;
	return module.exports;
	}
});


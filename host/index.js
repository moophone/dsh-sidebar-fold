'use strict';

/**
 * dsh-sidebar-fold — Host 半侧。
 *
 * 职责：无。本插件是纯客户端（client-only）插件，
 * 折叠逻辑全部跑在浏览器侧（client/client.js），
 * Host 侧只需要一个可被 bundle patch 拉起的占位 apply。
 *
 * 之所以还需要 host/index.js：`exports["."]` 必须指向一个真实文件，
 * cordis 加载 bundle 时会 require 它；返回空 apply 即可。
 */

function apply() {
  // 无 host 侧逻辑：折叠全部跑在浏览器侧（client/client.js）。
  // 这里刻意不调用 ctx.effect —— 宿主半侧无事可做，
  // 挂一个空 effect 只会让 dispose 链多一层无意义包装。
}

module.exports = { apply };

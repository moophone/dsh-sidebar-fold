/**
 * dsh-sidebar-fold — Host 半侧（ESM）。
 *
 * 职责：无。本插件是纯客户端（client-only）插件，
 * 折叠逻辑全部跑在浏览器侧（client/client.js），
 * Host 侧只需要一个可被 bundle patch 拉起的占位入口。
 *
 * 之所以还需要 host/index.js：`exports["."]` 必须指向一个真实文件，
 * cordis 加载 bundle 时会 import 它；导出空 apply 即可。
 *
 * ⚠️ 必须是 ESM（export 语法），不能是 CJS（module.exports）：
 * loader 在浏览器 bundle 里 import 这个文件，CJS 语法会让 fiber
 * 永远卡在 LOADING 状态，导致整个 web-boot 崩溃。
 */

export const name = 'dsh-sidebar-fold'

// 声明依赖的服务：本插件 host 半侧不需要任何服务。
export const inject = []

export function apply() {
  // 无 host 侧逻辑：折叠全部跑在浏览器侧（client/client.js）。
  // 这里刻意不调用 ctx.effect —— 宿主半侧无事可做，
  // 挂一个空 effect 只会让 dispose 链多一层无意义包装。
}

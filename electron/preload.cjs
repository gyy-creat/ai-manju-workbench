// 极小的 preload：只暴露「这是桌面版」和版本号给页面，
// 不做任何文件/网络能力注入 —— 工作台本身是纯浏览器应用，不该有特权通道。
const { contextBridge } = require('electron')

try {
  contextBridge.exposeInMainWorld('mjwDesktop', {
    isDesktop: true,
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    },
  })
} catch {
  /* 沙箱环境下忽略 */
}

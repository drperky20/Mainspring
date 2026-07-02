import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('mainspringDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
})

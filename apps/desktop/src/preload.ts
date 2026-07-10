import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopDiagnostics } from './DesktopDiagnostics.js'

contextBridge.exposeInMainWorld('mainspringDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  diagnostics: {
    get: (): Promise<DesktopDiagnostics> => ipcRenderer.invoke('mainspring:diagnostics.get'),
  },
})

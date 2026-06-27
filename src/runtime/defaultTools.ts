import { createBrowserTools, type BrowserToolOptions } from '../tools/BrowserTool.js'
import { createFileTools } from '../tools/FileTools.js'
import { createShellTool } from '../tools/ShellTool.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { createWebTools, type WebFetchToolOptions } from '../tools/WebTools.js'

export interface DefaultRuntimeToolOptions {
  browser?: BrowserToolOptions
  web?: WebFetchToolOptions
}

export function createDefaultRuntimeTools(options: DefaultRuntimeToolOptions = {}): RuntimeTool[] {
  return [
    ...createFileTools(),
    ...createWebTools(options.web),
    ...createBrowserTools(options.browser),
    createShellTool(),
  ]
}

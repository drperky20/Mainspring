import { createBrowserTools } from '../tools/BrowserTool.js'
import { createFileTools } from '../tools/FileTools.js'
import { createMainspringTools } from '../tools/MainspringTools.js'
import { createMemoryTools } from '../tools/MemoryTool.js'
import { createSkillTools } from '../tools/SkillTools.js'
import type { RuntimeTool } from '../tools/ToolRegistry.js'
import { createWebTools } from '../tools/WebTools.js'

export function createMainspringRuntimeTools(): RuntimeTool[] {
  return [
    ...createFileTools(),
    ...createWebTools(),
    ...createMemoryTools(),
    ...createSkillTools(),
    ...createBrowserTools(),
    ...createMainspringTools(),
  ]
}

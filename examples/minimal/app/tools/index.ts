import type { McpServer } from '@proto/core-mcp'
import { registerUiTools, registerTools, registerEntityTools, registerWorkflowTools } from '@proto/core-mcp'

import taskWorkflow from '../workflows/task.js'
import itemTools from './items.js'

import { ENTITIES } from '../entities/index.js'

const ALL_APP_TOOLS = [
  ...itemTools,
]

export function registerAppTools(server: McpServer): void {
  registerUiTools(server)
  registerTools(server, ALL_APP_TOOLS)
  registerEntityTools(server, ENTITIES)
  registerWorkflowTools(server, taskWorkflow)
}

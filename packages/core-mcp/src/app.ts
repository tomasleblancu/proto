/**
 * createProtoMcp — single-call factory that builds a fully-wired MCP app.
 *
 * Auto-discovers tools, entities, and workflows from the app directory.
 * The developer only writes tool files (export default [...]) and optionally
 * entities/index + workflows — everything else is handled by the framework.
 *
 * Usage:
 *
 *   // app/mcp.ts (stdio)
 *   import { createProtoMcp } from '@proto/core-mcp'
 *   const app = await createProtoMcp({ name: 'my-app' })
 *   await app.stdio()
 *
 *   // app/mcp-http.ts (HTTP)
 *   import { createProtoMcp } from '@proto/core-mcp'
 *   const app = await createProtoMcp({ name: 'my-app' })
 *   await app.http({ port: 8093 })
 */
import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createMcpServer, runStdio, runHttp } from './index.js'
import { registerTools, type ToolDefinition } from './define-tool.js'
import { registerUiTools } from './tools/ui.js'
import { registerEntityTools } from './entity-tools.js'
import { registerWorkflowTools } from './workflow-tools.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EntityDefinition } from '@proto/core-shared'
import type { WorkflowDefinition } from '@proto/core-shared'

export interface ProtoMcpOptions {
  /** App name (used in MCP server metadata). */
  name: string
  version?: string

  /**
   * Directory containing tool files. Each .ts/.js file should export
   * default an array of ToolDefinition objects.
   * Defaults to ./tools (relative to the calling file).
   */
  toolsDir?: string

  /**
   * Path to entities barrel (e.g. ./entities/index.ts).
   * Should export `ENTITIES` as an array of EntityDefinition.
   * If omitted, auto-detected from ./entities/index.
   */
  entitiesPath?: string

  /**
   * Path to workflow definition file, or an already-imported WorkflowDefinition.
   * If omitted, auto-detected from ./workflows/*.
   */
  workflow?: string | WorkflowDefinition

  /** Extra tools to register alongside auto-discovered ones. */
  extraTools?: ToolDefinition[]

  /** Extra entities to register alongside auto-discovered ones. */
  extraEntities?: EntityDefinition[]
}

async function loadToolsFromDir(dir: string): Promise<ToolDefinition[]> {
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(
    f => (f.endsWith('.ts') || f.endsWith('.js')) && f !== 'index.ts' && f !== 'index.js'
  )

  const allTools: ToolDefinition[] = []

  for (const file of files) {
    const fullPath = join(dir, file)
    const mod = await import(pathToFileURL(fullPath).href)
    const tools = mod.default
    if (Array.isArray(tools)) {
      allTools.push(...tools)
    }
  }

  return allTools
}

async function loadEntities(basePath: string): Promise<EntityDefinition[]> {
  for (const ext of ['.ts', '.js']) {
    const p = basePath + ext
    if (existsSync(p)) {
      const mod = await import(pathToFileURL(p).href)
      return mod.ENTITIES || mod.default || []
    }
  }
  // Try without extension (might already have it)
  if (existsSync(basePath)) {
    const mod = await import(pathToFileURL(basePath).href)
    return mod.ENTITIES || mod.default || []
  }
  return []
}

async function loadWorkflow(basePath: string): Promise<WorkflowDefinition | null> {
  if (!existsSync(basePath)) return null

  const files = readdirSync(basePath).filter(
    f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.startsWith('_')
  )

  if (files.length === 0) return null

  // Load the first workflow file found
  const mod = await import(pathToFileURL(join(basePath, files[0])).href)
  return mod.default || null
}

function resolveAppDir(callerUrl?: string): string {
  if (callerUrl) {
    return dirname(callerUrl.replace('file://', ''))
  }
  return process.cwd()
}

export async function createProtoMcp(opts: ProtoMcpOptions) {
  // Resolve paths relative to cwd (app root)
  const appDir = process.cwd()

  const toolsDir = opts.toolsDir
    ? resolve(appDir, opts.toolsDir)
    : resolve(appDir, 'app', 'tools')

  const entitiesPath = opts.entitiesPath
    ? resolve(appDir, opts.entitiesPath)
    : resolve(appDir, 'app', 'entities', 'index')

  const workflowsDir = resolve(appDir, 'app', 'workflows')

  // Load everything
  const tools = await loadToolsFromDir(toolsDir)
  const entities = await loadEntities(entitiesPath)
  const extraTools = opts.extraTools || []
  const extraEntities = opts.extraEntities || []
  const allTools = [...tools, ...extraTools]
  const allEntities = [...entities, ...extraEntities]

  let workflow: WorkflowDefinition | null = null
  if (opts.workflow) {
    workflow = typeof opts.workflow === 'string'
      ? await loadWorkflow(resolve(appDir, opts.workflow)).then(w => w)
      : opts.workflow
  } else {
    workflow = await loadWorkflow(workflowsDir)
  }

  function buildServer(): McpServer {
    const server = createMcpServer({ name: opts.name, version: opts.version })
    registerUiTools(server)
    if (allTools.length > 0) registerTools(server, allTools)
    if (allEntities.length > 0) registerEntityTools(server, allEntities)
    if (workflow) registerWorkflowTools(server, workflow)
    return server
  }

  return {
    /** Run as stdio subprocess (for Claude Code CLI). */
    async stdio() {
      const server = buildServer()
      await runStdio(server)
    },

    /** Run as HTTP server (for Docker / standalone). */
    async http(httpOpts?: { port?: number }) {
      const port = httpOpts?.port || parseInt(process.env.MCP_PORT || '8093', 10)
      await runHttp({
        port,
        displayName: opts.name,
        buildServer,
      })
    },

    /** Get tool count (for smoke tests). */
    get toolCount() {
      const server = buildServer()
      return Object.keys((server as any)._registeredTools).length
    },
  }
}

/**
 * defineTool — declarative MCP tool definition.
 *
 * App code declares tools as data instead of calling server.tool() directly.
 * The framework later registers them via registerTools(), giving us a
 * single place to wrap handlers with context injection, error normalization,
 * logging, metrics, etc.
 *
 * Example (app-space):
 *
 *   import { defineTool } from '@tleblancureta/proto/mcp'
 *   import { z } from 'zod'
 *
 *   export default [
 *     defineTool({
 *       name: 'create_thing',
 *       description: 'Creates a thing.',
 *       schema: { name: z.string() },
 *       handler: async (args) => {
 *         // ... do work ...
 *         return { content: [{ type: 'text', text: 'ok' }] }
 *       },
 *     }),
 *   ]
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'

/**
 * Minimal MCP tool response shape. Tools that need structured agent responses
 * should use the `agent()` / `agentErr()` helpers from @proto/core-mcp and
 * return their output. Index signature matches the MCP SDK's tool callback
 * return type (allows fields like `_meta`, `isError`, etc.).
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  [key: string]: unknown
}

/**
 * Handler signature. Receives validated args (inferred from the Zod schema)
 * and must return an MCP-shaped result. Throwing is allowed — the framework
 * wraps the handler in try/catch and returns a normalized error response.
 */
export type ToolHandler<S extends z.ZodRawShape> = (
  args: z.infer<z.ZodObject<S>>,
) => Promise<ToolResult> | ToolResult

/**
 * Declarative tool definition. `schema` is a Zod raw shape (the same object
 * you'd pass as the third argument to `server.tool()` today).
 */
export interface ToolDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  description: string
  schema: S
  handler: ToolHandler<S>
}

/**
 * Identity helper with type inference. Pass a definition object, get it back
 * unchanged. Use in default exports of app/tools files:
 *
 *   export default [defineTool({ ... }), defineTool({ ... })]
 */
export function defineTool<S extends z.ZodRawShape>(
  def: ToolDefinition<S>,
): ToolDefinition<S> {
  return def
}

/**
 * Register an array of tool definitions on a server instance. Wraps each
 * handler in a try/catch that emits a normalized error response if the tool
 * throws.
 */
export function registerTools(
  server: McpServer,
  defs: readonly ToolDefinition[],
): void {
  for (const def of defs) {
    server.tool(
      def.name,
      def.description,
      def.schema,
      async (args: Record<string, unknown>) => {
        try {
          return await def.handler(args as never)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  summary: `Error en ${def.name}: ${message}`,
                  error: true,
                }),
              },
            ],
          }
        }
      },
    )
  }
}

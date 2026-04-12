import { createMcpServer, runHttp } from '@proto/core-mcp'
import { registerAppTools } from './tools/index.js'

const PORT = parseInt(process.env.MCP_PORT || '8093', 10)

await runHttp({
  port: PORT,
  displayName: 'minimal',
  buildServer: () => {
    const server = createMcpServer({ name: 'minimal', version: '0.1.0' })
    registerAppTools(server)
    return server
  },
})

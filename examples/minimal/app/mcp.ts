import { createMcpServer, runStdio } from '@proto/core-mcp'
import { registerAppTools } from './tools/index.js'

const server = createMcpServer({ name: 'minimal', version: '0.1.0' })
registerAppTools(server)

await runStdio(server)

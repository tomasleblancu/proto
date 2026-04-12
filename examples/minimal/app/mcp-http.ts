import { createProtoMcp } from 'proto/mcp'

const app = await createProtoMcp({ name: 'minimal' })
await app.http()

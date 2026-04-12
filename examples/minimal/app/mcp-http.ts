import { createProtoMcp } from '@proto/core-mcp'

const app = await createProtoMcp({ name: 'minimal' })
await app.http()

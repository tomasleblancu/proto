import { createProtoMcp } from '@proto/core-mcp'

const app = await createProtoMcp({ name: 'hermes' })
await app.http()

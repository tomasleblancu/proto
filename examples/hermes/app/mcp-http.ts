import { createProtoMcp } from 'proto/mcp'

const app = await createProtoMcp({ name: 'hermes' })
await app.http()

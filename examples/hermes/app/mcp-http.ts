import { createProtoMcp } from '@tleblancureta/proto/mcp'

const app = await createProtoMcp({ name: 'hermes' })
await app.http()

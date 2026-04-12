import { createProtoMcp } from '@tleblancureta/proto/mcp'

const app = await createProtoMcp({ name: 'minimal' })
await app.stdio()

/**
 * Monorepo gateway entrypoint — delegates to the proto package.
 * Kept for backward compat with `npm run dev:gateway` in the monorepo.
 */
import { createProtoGateway } from '@tleblancureta/proto/gateway'

await createProtoGateway()

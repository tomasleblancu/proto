import { Context, Next } from 'hono'
import { INTERNAL_SECRET } from './config.js'

export async function verifySecret(c: Context, next: Next) {
  if (!INTERNAL_SECRET) {
    return c.json({ error: 'INTERNAL_API_SECRET not configured' }, 500)
  }
  const secret = c.req.header('x-internal-secret')
  if (secret !== INTERNAL_SECRET) {
    return c.json({ error: 'Invalid secret' }, 401)
  }
  await next()
}

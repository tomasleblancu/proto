import type { Hono } from 'hono'

/**
 * Gmail OAuth flow:
 * - GET /gmail/auth → returns the Google consent URL (frontend opens it).
 * - POST /gmail/callback → exchanges code for tokens, stores in Supabase.
 */
export function registerGmailRoutes(app: Hono) {
  app.get('/gmail/auth', async (c) => {
    const { google } = await import('googleapis')
    const clientId = process.env.GMAIL_CLIENT_ID
    const clientSecret = process.env.GMAIL_CLIENT_SECRET
    const redirectUri = process.env.GMAIL_REDIRECT_URI || `${c.req.header('origin') || 'http://localhost:3001'}/gmail/callback`

    if (!clientId || !clientSecret) return c.json({ error: 'Gmail not configured' }, 500)

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      state: c.req.query('user_id') || '',
    })

    return c.json({ url })
  })

  app.post('/gmail/callback', async (c) => {
    const { google } = await import('googleapis')
    const { code, user_id } = await c.req.json()

    const clientId = process.env.GMAIL_CLIENT_ID
    const clientSecret = process.env.GMAIL_CLIENT_SECRET
    const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/gmail/callback'

    if (!clientId || !clientSecret) return c.json({ error: 'Gmail not configured' }, 500)

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

    try {
      const { tokens } = await oauth2.getToken(code)
      oauth2.setCredentials(tokens)

      const gmail = google.gmail({ version: 'v1', auth: oauth2 })
      const profile = await gmail.users.getProfile({ userId: 'me' })

      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      await db.from('gmail_tokens').upsert({
        user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        email: profile.data.emailAddress,
        updated_at: new Date().toISOString(),
      })

      return c.json({ email: profile.data.emailAddress, connected: true })
    } catch (err: any) {
      return c.json({ error: err.message }, 400)
    }
  })
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSupabase } from '../supabase.js'

/**
 * Built-in Gmail MCP tools — gives the agent per-user access to the
 * connected user's Gmail inbox via OAuth tokens stored in `gmail_tokens`.
 *
 * Wired automatically by `createProtoMcp`. The user connects their
 * account through the Gmail widget, which posts to /gmail/callback on
 * the gateway and upserts a row in `gmail_tokens`.
 *
 * Tools: gmail_status, read_emails, send_email, search_emails.
 *
 * USER_ID is set by the gateway per-request (see session.ts). It can be
 * either a UUID or an email address; we normalize to UUID via the auth
 * admin API when needed.
 */

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || ''
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || ''

async function resolveUserId(rawUserId: string): Promise<string> {
  if (!rawUserId.includes('@')) return rawUserId
  const db = getSupabase()
  const { data } = await db.auth.admin.listUsers()
  return data?.users?.find(u => u.email === rawUserId)?.id || rawUserId
}

async function getGmailClient(userId: string) {
  const { google } = await import('googleapis')
  const db = getSupabase()

  const { data: tokens } = await db.from('gmail_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokens) return null

  const oauth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })

  // Auto-refresh: googleapis fires `tokens` on refresh — persist the new pair
  oauth2.on('tokens', async (newTokens) => {
    await db.from('gmail_tokens').update({
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expiry_date: newTokens.expiry_date,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  })

  return google.gmail({ version: 'v1', auth: oauth2 })
}

function decodeBody(body: any): string {
  if (!body?.data) return ''
  return Buffer.from(body.data, 'base64url').toString('utf-8')
}

function extractBody(payload: any): string {
  if (payload.body?.data) return decodeBody(payload.body)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBody(part.body)
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBody(part.body).replace(/<[^>]*>/g, '')
      }
    }
  }
  return ''
}

function getHeader(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
}

export function registerGmailTools(server: McpServer) {
  const userIdEnv = () => process.env.USER_ID || ''

  // ── gmail_status ──────────────────────────────────────────────────────
  server.tool(
    'gmail_status',
    'Check if Gmail is connected for the current user. Returns the connected email and connection date, or instructs the user to connect from the Gmail widget if not yet linked.',
    {},
    async () => {
      const uid = await resolveUserId(userIdEnv())
      const db = getSupabase()
      const { data } = await db.from('gmail_tokens').select('email, connected_at').eq('user_id', uid).single()
      if (!data) {
        return { content: [{ type: 'text' as const, text: 'Gmail no conectado. El usuario debe abrir el widget Gmail en el shell y hacer click en "Conectar".' }] }
      }
      return { content: [{ type: 'text' as const, text: `Gmail conectado: ${data.email} (desde ${data.connected_at})` }] }
    },
  )

  // ── read_emails ───────────────────────────────────────────────────────
  server.tool(
    'read_emails',
    'Read recent emails from the user\'s Gmail inbox. Use the optional `query` to filter (Gmail search syntax: "from:x@y.com", "subject:foo", "is:unread", "after:2026/01/01", etc.). Returns from/to/subject/date/snippet/body for each match.',
    {
      query: z.string().optional().describe('Gmail search query (e.g. "from:supplier@example.com", "is:unread", "subject:invoice").'),
      max_results: z.number().default(5).describe('Max emails to return (default 5).'),
    },
    async (args) => {
      const uid = await resolveUserId(userIdEnv())
      const gmail = await getGmailClient(uid)
      if (!gmail) {
        return { content: [{ type: 'text' as const, text: 'Gmail no conectado. Pedile al usuario que abra el widget Gmail y haga click en "Conectar".' }] }
      }

      try {
        const list = await gmail.users.messages.list({
          userId: 'me',
          q: args.query || '',
          maxResults: args.max_results,
        })

        if (!list.data.messages?.length) {
          return { content: [{ type: 'text' as const, text: 'No se encontraron correos.' }] }
        }

        const emails = []
        for (const msg of list.data.messages) {
          const full = await gmail.users.messages.get({ userId: 'me', id: msg.id! })
          const headers = full.data.payload?.headers || []
          const body = extractBody(full.data.payload)

          emails.push({
            id: msg.id,
            from: getHeader(headers, 'From'),
            to: getHeader(headers, 'To'),
            subject: getHeader(headers, 'Subject'),
            date: getHeader(headers, 'Date'),
            snippet: full.data.snippet,
            body: body.slice(0, 1000),
          })
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(emails, null, 2) }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error leyendo Gmail: ${err.message}` }] }
      }
    },
  )

  // ── send_email ────────────────────────────────────────────────────────
  server.tool(
    'send_email',
    'Send an email from the user\'s Gmail. Plain-text body. Cc optional. Always confirm with the user before sending — emails go from their personal account.',
    {
      to: z.string().describe('Recipient email address.'),
      subject: z.string().describe('Email subject.'),
      body: z.string().describe('Email body (plain text).'),
      cc: z.string().optional().describe('Optional CC recipient.'),
    },
    async (args) => {
      const uid = await resolveUserId(userIdEnv())
      const gmail = await getGmailClient(uid)
      if (!gmail) {
        return { content: [{ type: 'text' as const, text: 'Gmail no conectado. Pedile al usuario que abra el widget Gmail y haga click en "Conectar".' }] }
      }

      const headers = [
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
        args.cc ? `Cc: ${args.cc}` : '',
        'Content-Type: text/plain; charset=utf-8',
        '',
        args.body,
      ].filter(Boolean).join('\r\n')

      const encoded = Buffer.from(headers).toString('base64url')

      try {
        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: encoded },
        })
        return { content: [{ type: 'text' as const, text: `Correo enviado a ${args.to} (ID: ${res.data.id})` }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error enviando: ${err.message}` }] }
      }
    },
  )

  // ── search_emails ─────────────────────────────────────────────────────
  server.tool(
    'search_emails',
    'Search emails using Gmail query syntax. Returns metadata only (from/subject/date/snippet) — use read_emails to get the body of a specific match.',
    {
      query: z.string().describe('Gmail search query. Examples: "from:john@example.com", "subject:invoice after:2026/01/01", "has:attachment filename:pdf".'),
      max_results: z.number().default(10).describe('Max results (default 10).'),
    },
    async (args) => {
      const uid = await resolveUserId(userIdEnv())
      const gmail = await getGmailClient(uid)
      if (!gmail) {
        return { content: [{ type: 'text' as const, text: 'Gmail no conectado. Pedile al usuario que abra el widget Gmail y haga click en "Conectar".' }] }
      }

      try {
        const list = await gmail.users.messages.list({
          userId: 'me',
          q: args.query,
          maxResults: args.max_results,
        })

        if (!list.data.messages?.length) {
          return { content: [{ type: 'text' as const, text: `No se encontraron correos para: "${args.query}"` }] }
        }

        const results = []
        for (const msg of list.data.messages.slice(0, args.max_results)) {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          })
          const headers = full.data.payload?.headers || []
          results.push({
            id: msg.id,
            from: getHeader(headers, 'From'),
            subject: getHeader(headers, 'Subject'),
            date: getHeader(headers, 'Date'),
            snippet: full.data.snippet,
          })
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] }
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }] }
      }
    },
  )
}

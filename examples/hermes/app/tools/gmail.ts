import { z } from 'zod'
import { defineTool, getSupabase } from '@tleblancureta/proto/mcp'

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || ''
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || ''

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

async function resolveUid(): Promise<string> {
  const userId = process.env.USER_ID || ''
  if (!userId.includes('@')) return userId
  const db = getSupabase()
  const { data } = await db.auth.admin.listUsers()
  return data?.users?.find(u => u.email === userId)?.id || userId
}

export default [
  defineTool({
    name: 'gmail_status',
    description: 'Check if Gmail is connected for the current user.',
    schema: {},
    handler: async () => {
      const db = getSupabase()
      const uid = await resolveUid()
      const { data } = await db.from('gmail_tokens').select('email, connected_at').eq('user_id', uid).single()
      if (!data) return { content: [{ type: 'text' as const, text: 'Gmail no conectado. El usuario debe conectar Gmail desde la web app (Config > Gmail).' }] }
      return { content: [{ type: 'text' as const, text: `Gmail conectado: ${data.email} (desde ${data.connected_at})` }] }
    },
  }),

  defineTool({
    name: 'read_emails',
    description: 'Read recent emails from the user\'s Gmail inbox.',
    schema: {
      query: z.string().optional().describe('Search query (Gmail search syntax). E.g. "from:supplier@example.com" or "subject:cotizacion"'),
      max_results: z.number().default(5).describe('Max emails to return'),
    },
    handler: async (args) => {
      const uid = await resolveUid()
      const gmail = await getGmailClient(uid)
      if (!gmail) return { content: [{ type: 'text' as const, text: 'Gmail no conectado.' }] }

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
  }),

  defineTool({
    name: 'send_email',
    description: 'Send an email from the user\'s Gmail.',
    schema: {
      to: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (plain text)'),
      cc: z.string().optional().describe('CC email address'),
    },
    handler: async (args) => {
      const uid = await resolveUid()
      const gmail = await getGmailClient(uid)
      if (!gmail) return { content: [{ type: 'text' as const, text: 'Gmail no conectado.' }] }

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
  }),

  defineTool({
    name: 'search_emails',
    description: 'Search emails by keyword, sender, or date range.',
    schema: {
      query: z.string().describe('Gmail search query. Examples: "from:john@example.com", "subject:invoice after:2026/01/01", "has:attachment filename:pdf"'),
      max_results: z.number().default(10).describe('Max results'),
    },
    handler: async (args) => {
      const uid = await resolveUid()
      const gmail = await getGmailClient(uid)
      if (!gmail) return { content: [{ type: 'text' as const, text: 'Gmail no conectado.' }] }

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
          const full = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'metadata', metadataHeaders: ['From', 'To', 'Subject', 'Date'] })
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
  }),
]

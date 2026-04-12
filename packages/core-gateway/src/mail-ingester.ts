import { ImapFlow } from 'imapflow'
import { simpleParser, type ParsedMail } from 'mailparser'
import { runClaude } from './claude-runner.js'
import { sendSystemMail } from './email-sender.js'
import {
  createThread,
  findThreadByMessageId,
  isMessageIdProcessed,
  listThreadMessages,
  normalizeSubject,
  recordMessage,
  type MailThread,
} from './mail-threads.js'
import { resolveCompanyByEmail } from './mail-router.js'

/**
 * IMAP poller that turns the system mailbox into a chat input
 * channel. Every ~30s it:
 *
 *   1. Connects to the configured IMAP account
 *   2. Fetches UNSEEN messages from INBOX
 *   3. For each:
 *      a. Dedups by Message-ID
 *      b. Resolves sender → company (via mail-router allowlist)
 *      c. Finds parent thread via In-Reply-To, or creates a new one
 *      d. Records the inbound mail_messages row
 *      e. Builds a prompt with prior thread history + the new message
 *      f. Calls runClaude with the thread's session_key (Claude CLI
 *         --resume gives automatic continuity)
 *      g. Replies via sendSystemMail with proper threading headers
 *      h. Marks the IMAP message as SEEN
 *
 * Non-allowlisted senders, bounces, auto-replies, and duplicates are
 * silently skipped (logged but not errored).
 *
 * Runs only when MAIL_IMAP_HOST (or HERMES_IMAP_HOST) is set — otherwise the module is a no-op.
 */

interface IngesterConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  pollIntervalMs: number
}

function loadConfig(): IngesterConfig | null {
  const host = process.env.MAIL_IMAP_HOST || process.env.HERMES_IMAP_HOST
  if (!host) return null
  const port = parseInt(process.env.MAIL_IMAP_PORT || process.env.HERMES_IMAP_PORT || '993', 10)
  const user = process.env.MAIL_IMAP_USER || process.env.HERMES_IMAP_USER || process.env.MAIL_SMTP_USER || process.env.HERMES_SMTP_USER
  const pass = process.env.MAIL_IMAP_PASS || process.env.HERMES_IMAP_PASS || process.env.MAIL_SMTP_PASS || process.env.HERMES_SMTP_PASS
  if (!user || !pass) {
    console.warn('[mail-ingester] MAIL_IMAP_HOST set but IMAP/SMTP credentials missing')
    return null
  }
  return {
    host,
    port,
    secure: port === 993,
    user,
    pass,
    pollIntervalMs: parseInt(process.env.MAIL_IMAP_POLL_MS || process.env.HERMES_IMAP_POLL_MS || '30000', 10),
  }
}

let running = false
let timer: NodeJS.Timeout | null = null

export function startMailIngester(): void {
  const config = loadConfig()
  if (!config) {
    console.log('[mail-ingester] disabled (no MAIL_IMAP_HOST configured)')
    return
  }
  if (running) return
  running = true
  console.log(`[mail-ingester] starting — ${config.user}@${config.host}:${config.port} every ${config.pollIntervalMs}ms`)

  // Kick off an immediate first poll, then interval
  const tick = async () => {
    try { await pollOnce(config) }
    catch (err) { console.error('[mail-ingester] poll error:', err) }
  }
  tick()
  timer = setInterval(tick, config.pollIntervalMs)
}

export function stopMailIngester(): void {
  if (timer) clearInterval(timer)
  timer = null
  running = false
}

async function pollOnce(config: IngesterConfig): Promise<void> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    logger: false,
  })

  try {
    await client.connect()
  } catch (err: any) {
    console.error('[mail-ingester] connect failed:', err?.message || err)
    return
  }

  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      // Search for unseen messages
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || uids.length === 0) return

      for (const uid of uids) {
        try {
          const msg: any = await client.fetchOne(String(uid), { source: true }, { uid: true })
          if (!msg || !msg.source) continue
          const parsed = await simpleParser(msg.source as Buffer)
          const processed = await processInboundMail(parsed)
          if (processed) {
            // Mark seen only if we handled it cleanly
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
          }
        } catch (err: any) {
          console.error(`[mail-ingester] failed to process uid=${uid}:`, err?.message || err)
        }
      }
    } finally {
      lock.release()
    }
  } finally {
    try { await client.logout() } catch {}
  }
}

/**
 * Core logic per inbound mail. Returns true if it should be marked as seen.
 */
async function processInboundMail(parsed: ParsedMail): Promise<boolean> {
  const messageId = parsed.messageId
  if (!messageId) {
    console.warn('[mail-ingester] skipping message without Message-ID')
    return true // mark seen anyway, nothing we can do
  }

  // Dedup
  if (await isMessageIdProcessed(messageId)) {
    return true
  }

  // Skip auto-replies, bounces, mailer-daemon
  const headers = parsed.headers
  if (headers.get('auto-submitted') && String(headers.get('auto-submitted')) !== 'no') {
    console.log(`[mail-ingester] skipping auto-submitted: ${messageId}`)
    return true
  }
  const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase()
  if (!fromAddr || /mailer-daemon|postmaster|no-?reply/i.test(fromAddr)) {
    console.log(`[mail-ingester] skipping system sender: ${fromAddr}`)
    return true
  }

  // Route to company via allowlist
  const route = await resolveCompanyByEmail(fromAddr)
  if (!route) {
    console.log(`[mail-ingester] no company match for ${fromAddr}, dropping`)
    return true // treat as spam, mark seen
  }

  // Thread lookup via In-Reply-To
  const inReplyTo = firstHeader(parsed.headers.get('in-reply-to'))
  const references = parsed.references
    ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
    : []
  const threadCandidates = [inReplyTo, ...references].filter(Boolean) as string[]

  let thread: MailThread | null = null
  for (const parentId of threadCandidates) {
    thread = await findThreadByMessageId(parentId)
    if (thread) break
  }

  if (thread && thread.company_id !== route.companyId) {
    console.warn(`[mail-ingester] thread ${thread.id} belongs to different company — ignoring parent`)
    thread = null
  }

  if (!thread) {
    thread = await createThread({
      companyId: route.companyId,
      subject: parsed.subject || null,
      initiatedBy: 'in',
      externalAddress: fromAddr,
    })
  }

  const body = cleanInboundBody(parsed.text || parsed.html || '')
  const subject = parsed.subject || '(sin asunto)'
  const toAddr = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to.value?.[0]?.address)
    : ''

  // Record inbound
  await recordMessage({
    threadId: thread.id,
    companyId: route.companyId,
    direction: 'in',
    messageId,
    inReplyTo: inReplyTo || null,
    fromAddress: fromAddr,
    toAddress: toAddr || 'system',
    subject,
    body,
  })

  // Build the agent prompt: prior thread history + the new inbound
  const history = await listThreadMessages(thread.id, 20)
  const prompt = buildAgentPrompt({
    history,
    newFrom: fromAddr,
    newBody: body,
    newSubject: subject,
  })

  console.log(`[mail-ingester] dispatching to agent: thread=${thread.id} from=${fromAddr}`)

  // Dispatch to Claude
  let agentResponse = ''
  try {
    const result = await runClaude({
      company_id: route.companyId,
      user_id: fromAddr,
      message: prompt,
      channel: 'email',
      session_key: thread.session_key,
      enabled_skills: ALL_SKILLS,
      company_context: `[Mensaje recibido por email desde ${fromAddr} en el thread "${thread.subject || subject}"]`,
      selected_files: [],
    })
    agentResponse = result.response || '(sin respuesta)'
  } catch (err: any) {
    console.error('[mail-ingester] runClaude failed:', err?.message || err)
    agentResponse = `(No se pudo procesar tu mensaje: ${err?.message || 'error interno'})`
  }

  // Reply via outbound
  const sendResult = await sendSystemMail({
    companyId: route.companyId,
    to: fromAddr,
    subject: normalizeSubject(subject) || subject,
    body: agentResponse,
    inReplyTo: messageId,
    threadId: thread.id,
    sessionKey: thread.session_key,
  })

  if (!sendResult.ok) {
    console.error('[mail-ingester] reply send failed:', sendResult.error)
  }

  return true
}

import { loadSkills } from './registry.js'

function getAllSkillNames(): string[] {
  try {
    return loadSkills().map(s => s.name)
  } catch {
    return []
  }
}

const ALL_SKILLS = getAllSkillNames()

function firstHeader(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return String(value[0]).trim()
  return String(value).trim()
}

/**
 * Strip quoted replies and signatures heuristically so the agent only
 * sees the user's fresh content.
 */
function cleanInboundBody(raw: string): string {
  if (!raw) return ''
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    // Common quote-reply delimiters (Gmail, Outlook, iOS Mail, es)
    if (/^On .+ wrote:\s*$/i.test(line)) break
    if (/^El .+ escribi[oó]:\s*$/i.test(line)) break
    if (/^-----Original Message-----/i.test(line)) break
    if (/^From:.+$/i.test(line) && out.length > 2) break
    // Drop quote lines
    if (/^>/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim()
}

interface PromptBuildOpts {
  history: Awaited<ReturnType<typeof listThreadMessages>>
  newFrom: string
  newSubject: string
  newBody: string
}

function buildAgentPrompt(opts: PromptBuildOpts): string {
  const parts: string[] = []
  parts.push(`Estas recibiendo un mensaje por email. Tu respuesta sera enviada de vuelta al remitente como reply automatico.`)
  parts.push('')
  parts.push(`Remitente: ${opts.newFrom}`)
  parts.push(`Asunto: ${opts.newSubject}`)
  parts.push('')

  // Skip the current inbound message — it's shown separately below
  const prior = opts.history.filter(m => m.body && m.body.trim().length > 0)
  const prevMessages = prior.slice(0, -1)
  if (prevMessages.length > 0) {
    parts.push('--- Historial del thread ---')
    for (const m of prevMessages) {
      const who = m.direction === 'out' ? 'Assistant' : m.from_address
      parts.push(`[${who}]`)
      parts.push(m.body || '')
      parts.push('')
    }
    parts.push('--- Fin del historial ---')
    parts.push('')
  }

  parts.push('--- Mensaje actual del usuario ---')
  parts.push(opts.newBody)
  parts.push('--- Fin del mensaje ---')
  parts.push('')
  parts.push(`Responde al usuario. Tu respuesta sera enviada como reply al thread. No incluyas headers, From/To, ni firmas — el sistema las agrega. Escribi solo el cuerpo de la respuesta, en texto plano, tono directo y util. Usa las tools MCP que necesites.`)

  return parts.join('\n')
}
